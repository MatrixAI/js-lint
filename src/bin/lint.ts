#!/usr/bin/env node
import type { CLIOptions } from '../types.js';
import path from 'node:path';
import process from 'node:process';
import fs from 'node:fs';
import url from 'node:url';
import { Command, Option } from 'commander';
import Logger, { StreamHandler } from '@matrixai/logger';
import {
  LINT_DOMAINS,
  resolveDomainSelection,
  createBuiltInDomainRegistry,
  listLintDomains,
  evaluateLintDomains,
  runLintDomainDecisions,
  type LintDomainDecision,
} from '../domains/index.js';
import * as utils from '../utils.js';

const program = new Command();

const dirname = path.dirname(url.fileURLToPath(import.meta.url));
const builtinPrettierCfg = path.resolve(
  dirname,
  '../configs/prettier.config.js',
);

program
  .name('matrixai-lint')
  .description(
    'Lint source files, scripts, and markdown with configured rules.',
  )
  .addOption(
    new Option('-v, --verbose', 'Increase log verbosity')
      .argParser((_: string, previous: number = 0) => previous + 1)
      .default(0),
  )
  .option('-f, --fix', 'Automatically fix problems')
  .option('--list-domains', 'List available lint domains and exit')
  .option('--explain', 'Print per-domain selection and execution decisions')
  .option(
    '--user-config',
    'Use user-provided ESLint config instead of built-in one',
  )
  .option('--eslint-config <path>', 'Path to explicit ESLint config file')
  .option('--eslint <target...>', 'ESLint targets (files, roots, or globs)')
  .option('--markdown <target...>', 'Markdown targets (files, roots, or globs)')
  .option(
    '--shell <target...>',
    'Shell targets (files, roots, or globs) used to derive shellcheck search roots',
  )
  .addOption(
    new Option(
      '--domain <id...>',
      `Run only selected domains (${LINT_DOMAINS.join(', ')})`,
    ).choices(LINT_DOMAINS),
  )
  .addOption(
    new Option(
      '--skip-domain <id...>',
      `Skip selected domains (${LINT_DOMAINS.join(', ')})`,
    ).choices(LINT_DOMAINS),
  );

function describeAvailability(decision: LintDomainDecision): string {
  if (decision.detection == null) {
    return 'not-evaluated';
  }

  const detection = decision.detection;
  const status = detection.available ? 'available' : 'unavailable';
  const reason = detection.unavailableReason;

  return reason != null && reason.length > 0
    ? `${status} (${detection.availabilityKind}; ${reason})`
    : `${status} (${detection.availabilityKind})`;
}

function describeRelevance(decision: LintDomainDecision): string {
  if (decision.detection == null) {
    return decision.plannedAction === 'skip-unselected'
      ? 'not-evaluated (domain not selected)'
      : 'not-evaluated';
  }

  const detection = decision.detection;
  const status = detection.relevant ? 'relevant' : 'not-relevant';
  const reason = detection.relevanceReason;

  return reason != null && reason.length > 0 ? `${status} (${reason})` : status;
}

function printDomainList(
  logger: Logger,
  domains: Array<{ domain: string; description: string }>,
): void {
  logger.info('Available lint domains:');
  for (const domainInfo of domains) {
    logger.info(`- ${domainInfo.domain}: ${domainInfo.description}`);
  }
}

function printExplain(
  logger: Logger,
  decisions: readonly LintDomainDecision[],
): void {
  logger.info('[matrixai-lint] Domain execution plan:');
  for (const decision of decisions) {
    logger.info(`[matrixai-lint]  -  domain: ${decision.domain}`);
    logger.info(
      `[matrixai-lint]     selection: ${decision.selectionSource}${decision.explicitlyRequested ? ' (explicit)' : ''}`,
    );
    logger.info(
      `[matrixai-lint]     relevance: ${describeRelevance(decision)}`,
    );
    logger.info(
      `[matrixai-lint]     availability: ${describeAvailability(decision)}`,
    );
    if (decision.detectionError != null) {
      logger.error(
        `[matrixai-lint]     detection-error: ${decision.detectionError}`,
      );
    }
    logger.info(
      `[matrixai-lint]     planned-action: ${decision.plannedAction}`,
    );
  }
}

async function main(argv = process.argv) {
  await program.parseAsync(argv);
  const options = program.opts<CLIOptions>();
  const logger = new Logger('matrixai-lint', undefined, [new StreamHandler()]);
  logger.setLevel(utils.verboseToLogLevel(options.verbose));

  const fix = Boolean(options.fix);
  const useUserConfig = Boolean(options.userConfig);
  const explicitConfigPath: string | undefined = options.eslintConfig;
  const listDomainsOnly = Boolean(options.listDomains);
  const explain = Boolean(options.explain);

  const eslintPatterns: string[] | undefined = options.eslint;
  const markdownPatterns: string[] | undefined = options.markdown;
  const shellPatterns: string[] | undefined = options.shell;
  const { selectedDomains, explicitlyRequestedDomains, selectionSources } =
    resolveDomainSelection(options);

  const domainRegistry = createBuiltInDomainRegistry({
    prettierConfigPath: builtinPrettierCfg,
  });

  if (listDomainsOnly) {
    printDomainList(
      logger,
      listLintDomains({
        registry: domainRegistry,
        executionOrder: LINT_DOMAINS,
      }),
    );
    return;
  }

  let hadFailure = false;

  // Resolve which config file to use
  let chosenConfig: string | undefined;
  let isConfigValid = true;

  if (explicitConfigPath !== undefined) {
    const absolutePath = path.resolve(explicitConfigPath);

    if (!fs.existsSync(absolutePath)) {
      logger.error(
        `--eslint-config points to "${explicitConfigPath}", but that file does not exist.`,
      );
      hadFailure = true;
      isConfigValid = false;
    } else {
      chosenConfig = absolutePath;
    }
  } else if (useUserConfig) {
    chosenConfig = utils.findUserESLintConfig();
    if (chosenConfig === undefined) {
      logger.warn(
        '--user-config given but no local ESLint config was found. Falling back to built-in config.',
      );
    }
  }

  const decisions = await evaluateLintDomains({
    registry: domainRegistry,
    selectedDomains,
    explicitlyRequestedDomains,
    selectionSources,
    executionOrder: LINT_DOMAINS,
    context: {
      fix,
      logger,
      chosenConfig,
      isConfigValid,
      eslintPatterns,
      markdownPatterns,
      shellPatterns,
    },
  });

  if (explain) {
    printExplain(logger, decisions);
  }

  const hadDomainFailure = await runLintDomainDecisions({
    registry: domainRegistry,
    decisions,
    context: {
      fix,
      logger,
      chosenConfig,
      isConfigValid,
      eslintPatterns,
      markdownPatterns,
      shellPatterns,
    },
  });

  if (hadDomainFailure) {
    hadFailure = true;
  }

  if (hadFailure) {
    logger.error('[matrixai-lint]  ✖  Linting failed.');
    process.exit(1);
  } else {
    logger.info('[matrixai-lint]  ✔  Linting passed.');
  }
}

if (import.meta.url.startsWith('file:')) {
  const modulePath = url.fileURLToPath(import.meta.url);
  if (process.argv[1] === modulePath) {
    void main();
  }
}

export default main;
