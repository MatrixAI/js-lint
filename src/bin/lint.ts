#!/usr/bin/env node
import type { CLIOptions, LintDomain } from '../types.js';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import url from 'node:url';
import { Command, Option } from 'commander';
import * as utils from '../utils.js';

const platform = os.platform();
const program = new Command();
const DEFAULT_SHELLCHECK_SEARCH_ROOTS = ['./src', './scripts', './tests'];
const LINT_DOMAINS: LintDomain[] = ['eslint', 'shell', 'markdown'];

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

function resolveDomainSelection(options: CLIOptions): {
  selectedDomains: Set<LintDomain>;
  shellDomainExplicitlyRequested: boolean;
} {
  const onlyDomains = options.only ?? [];
  const skipDomains = new Set(options.skip ?? []);
  const hasDomainSelectors = onlyDomains.length > 0 || skipDomains.size > 0;
  const hasExplicitESLintTargets = (options.eslint?.length ?? 0) > 0;
  const hasExplicitShellTargets = (options.shell?.length ?? 0) > 0;

  let selectedDomains: Set<LintDomain>;

  if (onlyDomains.length > 0) {
    selectedDomains = new Set<LintDomain>(onlyDomains);
  } else if (
    !hasDomainSelectors &&
    (hasExplicitESLintTargets || hasExplicitShellTargets)
  ) {
    selectedDomains = new Set<LintDomain>();
    if (hasExplicitESLintTargets) selectedDomains.add('eslint');
    if (hasExplicitShellTargets) selectedDomains.add('shell');
  } else {
    selectedDomains = new Set<LintDomain>(LINT_DOMAINS);
  }

  for (const domain of skipDomains) {
    selectedDomains.delete(domain);
  }

  const shellDomainExplicitlyRequested =
    selectedDomains.has('shell') &&
    (onlyDomains.includes('shell') || hasExplicitShellTargets);

  return { selectedDomains, shellDomainExplicitlyRequested };
}

const SHELL_FILE_PATTERN = /\.sh$/i;

function collectShellFiles(searchRoots: string[]): string[] {
  const shellFiles = new Set<string>();

  const visitPath = (entryPath: string): void => {
    let entryStats: fs.Stats;
    try {
      entryStats = fs.statSync(entryPath);
    } catch {
      return;
    }

    if (entryStats.isFile()) {
      if (SHELL_FILE_PATTERN.test(entryPath)) {
        shellFiles.add(entryPath);
      }
      return;
    }

    if (!entryStats.isDirectory()) {
      return;
    }

    let dirEntries: fs.Dirent[];
    try {
      dirEntries = fs.readdirSync(entryPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const dirEntry of dirEntries) {
      const childPath = path.join(entryPath, dirEntry.name);
      if (dirEntry.isDirectory()) {
        visitPath(childPath);
      } else if (dirEntry.isFile() && SHELL_FILE_PATTERN.test(dirEntry.name)) {
        shellFiles.add(childPath);
      }
    }
  };

  for (const searchRoot of searchRoots) {
    visitPath(searchRoot);
  }

  return [...shellFiles].sort();
}

/* eslint-disable no-console */
async function main(argv = process.argv) {
  await program.parseAsync(argv);
  const options = program.opts<CLIOptions>();

  const fix = Boolean(options.fix);
  const useUserConfig = Boolean(options.userConfig);
  const explicitConfigPath: string | undefined = options.config;

  const eslintPatterns: string[] | undefined = options.eslint;
  const shellPatterns: string[] | undefined = options.shell;
  const { selectedDomains, shellDomainExplicitlyRequested } =
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

  if (selectedDomains.has('eslint')) {
    if (!isConfigValid) {
      console.error('Skipping ESLint due to invalid --config path.');
      hadFailure = true;
    } else {
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
    }
  }

  if (selectedDomains.has('shell')) {
    const hasShellcheck = utils.commandExists('shellcheck');

    if (!hasShellcheck) {
      if (shellDomainExplicitlyRequested) {
        console.error(
          'Shell domain requested explicitly, but shellcheck was not found in environment.',
        );
        hadFailure = true;
      } else {
        console.warn(
          'Skipping shellcheck: shellcheck not found in environment.',
        );
      }
    } else {
      const searchRoots = (
        shellPatterns?.length ? shellPatterns : DEFAULT_SHELLCHECK_SEARCH_ROOTS
      )
        .map((p) => path.resolve(process.cwd(), p))
        .filter((p) => fs.existsSync(p));

      console.error('Running shellcheck:');
      if (searchRoots.length === 0) {
        console.warn(
          'No search roots found for shellcheck. Skipping shellcheck.',
        );
      } else {
        const shellFiles = collectShellFiles(searchRoots);
        if (shellFiles.length === 0) {
          console.warn(
            'No shell script files found for shellcheck. Skipping shellcheck.',
          );
        } else {
          console.error(' ' + ['shellcheck', ...shellFiles].join(' '));
          try {
            childProcess.execFileSync('shellcheck', shellFiles, {
              stdio: ['inherit', 'inherit', 'inherit'],
              windowsHide: true,
              encoding: 'utf-8',
              shell: platform === 'win32',
              cwd: process.cwd(),
            });
          } catch (err) {
            console.error('Shellcheck failed. ' + err);
            hadFailure = true;
          }
        }
      }
    }
  }

  if (selectedDomains.has('markdown')) {
    // Linting markdown files
    // Always include README if it exists
    const markdownFiles: string[] = [];
    if (fs.existsSync('README.md')) {
      markdownFiles.push('README.md');
    }
    for (const dir of ['pages', 'blog', 'docs']) {
      if (fs.existsSync(dir)) {
        markdownFiles.push(...utils.collectMarkdown(dir));
      }
    }
    if (markdownFiles.length === 0) {
      console.warn('Skipping Prettier: no Markdown/MDX files found.');
    } else {
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
          console.error(` ${prettierBin} \n ${prettierArgs.join('\n' + ' ')}`);
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
          console.error('prettier' + prettierArgs.join('\n' + ' '));
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
        } else {
          console.error('Prettier write failed. ' + err);
        }
        hadFailure = true;
      }
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

if (import.meta.url.startsWith('file:')) {
  const modulePath = url.fileURLToPath(import.meta.url);
  if (process.argv[1] === modulePath) {
    void main();
  }
}

export default main;
