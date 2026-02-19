#!/usr/bin/env node
import type { CLIOptions } from '../types.js';
import path from 'node:path';
import process from 'node:process';
import fs from 'node:fs';
import url from 'node:url';
import { Command, Option } from 'commander';
import {
  LINT_DOMAINS,
  resolveDomainSelection,
  createBuiltInDomainRegistry,
  runLintDomains,
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
  .option('-f, --fix', 'Automatically fix problems')
  .option(
    '--user-config',
    'Use user-provided ESLint config instead of built-in one',
  )
  .option('--config <path>', 'Path to explicit ESLint config file')
  .option('--eslint <pat...>', 'Glob(s) to pass to ESLint')
  .option('--shell <pat...>', 'Glob(s) to pass to shellcheck search roots')
  .addOption(
    new Option(
      '--only <domains...>',
      `Run only selected domains (${LINT_DOMAINS.join(', ')})`,
    ).choices(LINT_DOMAINS),
  )
  .addOption(
    new Option(
      '--skip <domains...>',
      `Skip selected domains (${LINT_DOMAINS.join(', ')})`,
    ).choices(LINT_DOMAINS),
  );

/* eslint-disable no-console */
async function main(argv = process.argv) {
  await program.parseAsync(argv);
  const options = program.opts<CLIOptions>();

  const fix = Boolean(options.fix);
  const useUserConfig = Boolean(options.userConfig);
  const explicitConfigPath: string | undefined = options.config;

  const eslintPatterns: string[] | undefined = options.eslint;
  const shellPatterns: string[] | undefined = options.shell;
  const { selectedDomains, explicitlyRequestedDomains } =
    resolveDomainSelection(options);

  let hadFailure = false;

  // Resolve which config file to use
  let chosenConfig: string | undefined;
  let isConfigValid = true;

  if (explicitConfigPath !== undefined) {
    const absolutePath = path.resolve(explicitConfigPath);

    if (!fs.existsSync(absolutePath)) {
      console.error(
        `--config points to "${explicitConfigPath}", but that file does not exist.`,
      );
      hadFailure = true;
      isConfigValid = false;
    } else {
      chosenConfig = absolutePath;
    }
  } else if (useUserConfig) {
    chosenConfig = utils.findUserESLintConfig();
    if (chosenConfig === undefined) {
      console.error(
        '--user-config given but no local ESLint config was found. Falling back to built-in config.',
      );
    }
  }

  const domainRegistry = createBuiltInDomainRegistry({
    prettierConfigPath: builtinPrettierCfg,
  });
  const hadDomainFailure = await runLintDomains({
    registry: domainRegistry,
    selectedDomains,
    explicitlyRequestedDomains,
    executionOrder: LINT_DOMAINS,
    context: {
      fix,
      chosenConfig,
      isConfigValid,
      eslintPatterns,
      shellPatterns,
    },
  });

  if (hadDomainFailure) {
    hadFailure = true;
  }

  if (hadFailure) {
    console.error('[matrixai-lint]  ✖  Linting failed.');
    process.exit(1);
  } else {
    console.error('[matrixai-lint]  ✔  Linting passed.');
  }
}
/* eslint-enable no-console */

if (import.meta.url.startsWith('file:')) {
  const modulePath = url.fileURLToPath(import.meta.url);
  if (process.argv[1] === modulePath) {
    void main();
  }
}

export default main;
