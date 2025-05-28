#!/usr/bin/env node
import type { CLIOptions } from '../types.js';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import url from 'node:url';
import { Command } from 'commander';
import * as utils from '../utils.js';

const platform = os.platform();
const program = new Command();
const DEFAULT_SHELLCHECK_SEARCH_ROOTS = ['./src', './scripts', './tests'];

const dirname = path.dirname(url.fileURLToPath(import.meta.url));
const builtinPrettierCfg = path.resolve(
  dirname,
  '../configs/prettier.config.mjs',
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
  .option('--shell  <pat...>', 'Glob(s) to pass to shell-check')
  .allowUnknownOption(true); // Optional: force rejection of unknown flags

/* eslint-disable no-console */
async function main(argv = process.argv) {
  await program.parseAsync(argv);
  const options = program.opts<CLIOptions>();

  const fix = Boolean(options.fix);
  const useUserConfig = Boolean(options.userConfig);
  const explicitConfigPath: string | undefined = options.config;

  const eslintPatterns: string[] | undefined = options.eslint;
  const shellPatterns: string[] | undefined = options.shell;

  let hadFailure = false;

  // Resolve which config file to use
  let chosenConfig: string | undefined;

  if (explicitConfigPath !== undefined) {
    const absolutePath = path.resolve(explicitConfigPath);

    if (!fs.existsSync(absolutePath)) {
      console.error(
        `--config points to “${explicitConfigPath}”, but that file does not exist.`,
      );
      process.exit(1); // Hard‑fail; nothing to lint against
    }

    chosenConfig = absolutePath;
  } else if (useUserConfig) {
    chosenConfig = utils.findUserESLintConfig();
    if (chosenConfig === undefined) {
      console.error(
        '--user-config given but no local ESLint config was found. Falling back to built-in config.',
      );
    }
  }

  try {
    const hadLintingErrors = await utils.runESLint({
      fix,
      configPath: chosenConfig,
      explicitGlobs: eslintPatterns,
    });

    if (hadLintingErrors) {
      hadFailure = true;
    }
  } catch (err) {
    console.error(`ESLint failed: \n${err}`);
    hadFailure = true;
  }

  const searchRoots = (
    shellPatterns?.length ? shellPatterns : DEFAULT_SHELLCHECK_SEARCH_ROOTS
  )
    .map((p) => path.resolve(process.cwd(), p))
    .filter((p) => fs.existsSync(p));

  // Linting shell scripts (this does not have auto-fixing)
  const shellCheckArgs = [
    ...searchRoots,
    '-type',
    'f',
    '-regextype',
    'posix-extended',
    '-regex',
    '.*\\.(sh)',
    '-exec',
    'shellcheck',
    '{}',
    '+',
  ];
  if (utils.commandExists('find') && utils.commandExists('shellcheck')) {
    console.error('Running shellcheck:');
    if (searchRoots.length === 0) {
      console.warn(
        'No search roots found for shellcheck. Skipping shellcheck.',
      );
    } else {
      console.error(' ' + ['find', ...shellCheckArgs].join(' '));
      try {
        childProcess.execFileSync('find', shellCheckArgs, {
          stdio: ['inherit', 'inherit', 'inherit'],
          windowsHide: true,
          encoding: 'utf-8',
          shell: platform === 'win32' ? true : false,
          cwd: process.cwd(),
        });
      } catch (err) {
        console.error('Shellcheck failed. ' + err);
        hadFailure = true;
      }
    }
  } else {
    console.warn(
      'Skipping shellcheck: find or shellcheck not found in environment.',
    );
  }

  // Linting markdown files
  // Always include README if it exists
  const markdownFiles: string[] = [];
  if (fs.existsSync('README.md')) markdownFiles.push('README.md');
  for (const dir of ['pages', 'blog', 'docs']) {
    if (fs.existsSync(dir)) markdownFiles.push(...utils.collectMarkdown(dir));
  }
  if (markdownFiles.length === 0) {
    console.warn('Skipping Prettier: no Markdown/MDX files found.');
    return;
  }

  const prettierArgs = [
    '--config',
    builtinPrettierCfg,
    '--config-precedence',
    'cli-override',
    '--no-editorconfig',
    fix ? '--write' : '--check',
    ...markdownFiles,
  ];

  console.error('Running prettier:');

  const require = createRequire(import.meta.url);
  let prettierBin: string | null = null;
  try {
    // Resolves to @matrixai/lint/node_modules/prettier/bin/prettier.cjs
    prettierBin = require.resolve('prettier/bin/prettier.cjs');
  } catch {
    // Bundled copy not found
  }

  try {
    if (prettierBin) {
      console.error(
        ` ${process.execPath} ${prettierBin} ${prettierArgs.join(' ')}`,
      );
      childProcess.execFileSync(
        process.execPath,
        [prettierBin, ...prettierArgs],
        {
          stdio: 'inherit',
          windowsHide: true,
          encoding: 'utf-8',
          cwd: process.cwd(),
        },
      );
    } else {
      console.error(' prettier ' + prettierArgs.join(' '));
      childProcess.execFileSync('prettier', prettierArgs, {
        stdio: 'inherit',
        windowsHide: true,
        encoding: 'utf-8',
        shell: platform === 'win32',
        cwd: process.cwd(),
      });
    }
  } catch (err) {
    if (!fix) {
      console.error('Prettier check failed.');
      hadFailure = true;
    } else {
      throw err; // Should not happen when --write
    }
  }

  if (hadFailure) {
    console.error('[matrixai-lint]  ✖  Linting failed.');
    process.exit(1);
  } else {
    console.error('[matrixai-lint]  ✔  Linting passed.');
  }
}

/* eslint-enable no-console */

export default main;

if (import.meta.url.startsWith('file:')) {
  void main();
}
