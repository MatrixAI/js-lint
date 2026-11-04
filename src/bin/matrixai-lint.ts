#!/usr/bin/env node
import type { CLIOptions } from '../types.js';
import type { LintDomainDecision } from '../domains.js';
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
} from '../domains.js';
import { resolveLintConfig } from '../config.js';
import { resolveExecutionPolicy } from '../policy.js';
import { projectTypeScriptProvenance } from '../projectTypeScript.js';
import * as eslintUtils from '../eslint/utils.js';
import * as utils from '../utils.js';

const dirname = path.dirname(url.fileURLToPath(import.meta.url));
const builtinPrettierCfg = path.resolve(
  dirname,
  '../configs/prettier.config.js',
);

function collectOption(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function createProgram(): Command {
  const program = new Command();
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
    .option('--check', 'Check without modifying source (the CLI default)')
    .option('--root <path>', 'Explicit project root')
    .option('--strict', 'Fail when any relevant backend is unavailable')
    .option(
      '--plan',
      'Print the effective policy and execution plan without running backends',
    )
    .option(
      '--report <path>',
      'Write a JSON execution report outside maintained source',
    )
    .option(
      '--extend-target <domain=target>',
      'Extend a domain without narrowing domain selection',
      collectOption,
      [],
    )
    .option(
      '--replace-target <domain=target>',
      'Replace domain targets; domain= explicitly clears them',
      collectOption,
      [],
    )
    .option(
      '--exclude-target <domain=target>',
      'Exclude domain targets',
      collectOption,
      [],
    )
    .option('--list-domains', 'List available lint domains and exit')
    .option('--explain', 'Print per-domain selection and execution decisions')
    .option(
      '--user-config',
      'Deprecated ESLint-only alias; use --eslint-config <path>',
    )
    .option('--eslint-config <path>', 'Path to explicit ESLint config file')
    .option('--eslint <target...>', 'ESLint targets (files, roots, or globs)')
    .option(
      '--markdown <target...>',
      'Markdown targets (files, roots, or globs)',
    )
    .option('--svg <target...>', 'SVG targets (files, roots, or globs)')
    .option('--nix <target...>', 'Nix targets (files, roots, or globs)')
    .option('--sql <target...>', 'SQL targets (files, roots, or globs)')
    .option(
      '--rust <target...>',
      'Rust file targets; Clippy expands to the Cargo package',
    )
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
  return program;
}

function findProjectRoot(start: string): string {
  let current = path.resolve(start);
  while (true) {
    if (
      [
        'matrixai-lint-config.json',
        'flake.nix',
        'Cargo.toml',
        'package.json',
        'tsconfig.json',
        '.git',
      ].some((name) => fs.existsSync(path.join(current, name)))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(start);
    current = parent;
  }
}

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
    logger.info(
      `Domain info: domain=${domainInfo.domain} description=${domainInfo.description}`,
    );
  }
}

function printExplain(
  logger: Logger,
  decisions: readonly LintDomainDecision[],
): void {
  logger.info('[matrixai-lint] Domain execution plan:');
  for (const decision of decisions) {
    logger.info(`[matrixai-lint] domain=${decision.domain}`);
    logger.info(
      `[matrixai-lint] selection=${decision.selectionSource}${decision.explicitlyRequested ? ' (explicit)' : ''}`,
    );
    logger.info(`[matrixai-lint] relevance=${describeRelevance(decision)}`);
    logger.info(
      `[matrixai-lint] availability=${describeAvailability(decision)}`,
    );
    if (decision.detectionError != null) {
      logger.error(
        `[matrixai-lint] detection-error=${decision.detectionError}`,
      );
    }
    logger.info(`[matrixai-lint] planned-action=${decision.plannedAction}`);
  }
}

async function main(argv = process.argv) {
  const program = createProgram();
  await program.parseAsync(argv);
  const options = program.opts<CLIOptions>();
  if (options.fix && options.check) {
    throw new Error('--fix and --check are mutually exclusive.');
  }
  const previousCwd = process.cwd();
  process.chdir(
    options.root === undefined
      ? findProjectRoot(previousCwd)
      : path.resolve(options.root),
  );
  try {
    const logger = new Logger('matrixai-lint', undefined, [
      new StreamHandler(),
    ]);
    logger.setLevel(utils.verboseToLogLevel(options.verbose));

    const fix = Boolean(options.fix);
    const useUserConfig = Boolean(options.userConfig);
    const explicitConfigPath: string | undefined = options.eslintConfig;
    const listDomainsOnly = Boolean(options.listDomains);
    const explain = Boolean(options.explain);
    const lintConfig = resolveLintConfig();

    const { selectedDomains, explicitlyRequestedDomains, selectionSources } =
      resolveDomainSelection(options);
    const policy = resolveExecutionPolicy(lintConfig, options, selectedDomains);
    for (const domain of LINT_DOMAINS) {
      if (!policy[domain].enabled) selectedDomains.delete(domain);
    }

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

    if (useUserConfig) {
      logger.warn(
        '--user-config is deprecated and ESLint-only. Use --eslint-config <path>; keep lint scope in matrixai-lint-config.json.',
      );
    }

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
      chosenConfig = eslintUtils.findUserESLintConfig();
      if (chosenConfig === undefined) {
        logger.warn(
          '--user-config given but no local ESLint config was found. Falling back to built-in config.',
        );
      }
    } else {
      chosenConfig = eslintUtils.findUserESLintConfig();
    }

    const context = {
      fix,
      logger,
      chosenConfig,
      isConfigValid,
      strict: options.strict,
      eslintPatterns: policy.eslint.files,
      markdownPatterns: policy.markdown.files,
      svgPatterns: policy.svg.files,
      nixPatterns: policy.nix.files,
      sqlPatterns: policy.sql.files,
      shellPatterns: policy.shell.files,
      rustPatterns: policy.rust.files,
      rustClippy: lintConfig.domains.rust.clippy,
      cargoArgs: lintConfig.domains.rust.cargoArgs,
    };
    const decisions = await evaluateLintDomains({
      registry: domainRegistry,
      selectedDomains,
      explicitlyRequestedDomains,
      selectionSources,
      executionOrder: LINT_DOMAINS,
      context,
    });

    if (explain || options.plan) {
      logger.info(`Effective policy: ${JSON.stringify(policy)}`);
      printExplain(logger, decisions);
    }
    if (options.plan) return;

    const hadDomainFailure = await runLintDomainDecisions({
      registry: domainRegistry,
      decisions,
      context,
    });

    if (hadDomainFailure) {
      hadFailure = true;
    }
    if (options.report !== undefined) {
      const destination = path.resolve(options.report);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(
        destination,
        JSON.stringify(
          {
            schemaVersion: 1,
            driverVersion: (
              JSON.parse(
                fs.readFileSync(
                  path.resolve(dirname, '../../package.json'),
                  'utf8',
                ),
              ) as { version: string }
            ).version,
            nodeVersion: process.version,
            projectTypeScript: projectTypeScriptProvenance(),
            toolchain: process.env.MATRIXAI_LINT_TOOLCHAIN ?? null,
            name: 'lint',
            kind: 'static',
            status: hadFailure ? 'failed' : 'passed',
            mode: fix ? 'fix' : 'check',
            root: process.cwd(),
            policy,
            decisions,
            summary: hadFailure
              ? 'Lint violations or backend failures remain.'
              : 'Selected lint scope passed.',
            artifacts: {},
          },
          null,
          2,
        ) + '\n',
      );
    }

    if (hadFailure) {
      logger.error('[matrixai-lint] ✖ Linting failed.');
      process.exit(1);
    } else {
      logger.info('[matrixai-lint] ✔ Linting passed.');
    }
  } finally {
    process.chdir(previousCwd);
  }
}

if (import.meta.url.startsWith('file:') && process.argv[1] != null) {
  const entryPath = process.argv[1];
  let entryUrl: string;
  try {
    entryUrl = entryPath.startsWith('file:')
      ? new URL(entryPath).href
      : url.pathToFileURL(fs.realpathSync.native(entryPath)).href;
  } catch {
    entryUrl = url.pathToFileURL(path.resolve(entryPath)).href;
  }
  if (entryUrl === new URL(import.meta.url).href) {
    void main();
  }
}

export default main;
