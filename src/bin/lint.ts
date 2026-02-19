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

type MainDeps = {
  runESLint: typeof utils.runESLint;
  findUserESLintConfig: typeof utils.findUserESLintConfig;
  collectMarkdown: typeof utils.collectMarkdown;
  commandExists: typeof utils.commandExists;
  execFileSync: typeof childProcess.execFileSync;
  fileExists: typeof fs.existsSync;
  parseAsync: (argv: string[]) => Promise<void>;
  opts: () => CLIOptions;
};

const defaultMainDeps: MainDeps = {
  runESLint: utils.runESLint,
  findUserESLintConfig: utils.findUserESLintConfig,
  collectMarkdown: utils.collectMarkdown,
  commandExists: utils.commandExists,
  execFileSync: ((...args: unknown[]) =>
    childProcess.execFileSync(
      args[0] as string,
      args[1] as ReadonlyArray<string> | undefined,
      args[2] as childProcess.ExecFileSyncOptions,
    )) as typeof childProcess.execFileSync,
  fileExists: fs.existsSync,
  parseAsync: async (argv) => {
    await program.parseAsync(argv);
  },
  opts: () => program.opts<CLIOptions>(),
};

/* eslint-disable no-console */
async function main(argv = process.argv) {
  await defaultMainDeps.parseAsync(argv);
  const options = defaultMainDeps.opts();

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

    if (!defaultMainDeps.fileExists(absolutePath)) {
      console.error(
        `--config points to "${explicitConfigPath}", but that file does not exist.`,
      );
      hadFailure = true;
      isConfigValid = false;
    } else {
      chosenConfig = absolutePath;
    }
  } else if (useUserConfig) {
    chosenConfig = defaultMainDeps.findUserESLintConfig();
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
        const hadLintingErrors = await defaultMainDeps.runESLint({
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
    const hasFind = defaultMainDeps.commandExists('find');
    const hasShellcheck = defaultMainDeps.commandExists('shellcheck');

    if (!(hasFind && hasShellcheck)) {
      if (shellDomainExplicitlyRequested) {
        console.error(
          'Shell domain requested explicitly, but find or shellcheck was not found in environment.',
        );
        hadFailure = true;
      } else {
        console.warn(
          'Skipping shellcheck: find or shellcheck not found in environment.',
        );
      }
    } else {
      const searchRoots = (
        shellPatterns?.length ? shellPatterns : DEFAULT_SHELLCHECK_SEARCH_ROOTS
      )
        .map((p) => path.resolve(process.cwd(), p))
        .filter((p) => defaultMainDeps.fileExists(p));

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

      console.error('Running shellcheck:');
      if (searchRoots.length === 0) {
        console.warn(
          'No search roots found for shellcheck. Skipping shellcheck.',
        );
      } else {
        console.error(' ' + ['find', ...shellCheckArgs].join(' '));
        try {
          defaultMainDeps.execFileSync('find', shellCheckArgs, {
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
    }
  }

  if (selectedDomains.has('markdown')) {
    // Linting markdown files
    // Always include README if it exists
    const markdownFiles: string[] = [];
    if (defaultMainDeps.fileExists('README.md')) {
      markdownFiles.push('README.md');
    }
    for (const dir of ['pages', 'blog', 'docs']) {
      if (defaultMainDeps.fileExists(dir)) {
        markdownFiles.push(...defaultMainDeps.collectMarkdown(dir));
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
          defaultMainDeps.execFileSync(
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
          defaultMainDeps.execFileSync('prettier', prettierArgs, {
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

async function mainWithDeps(
  argv: string[],
  deps: Partial<MainDeps>,
): Promise<void> {
  const previousDeps = {
    ...defaultMainDeps,
  };
  Object.assign(defaultMainDeps, deps);
  try {
    await main(argv);
  } finally {
    Object.assign(defaultMainDeps, previousDeps);
  }
}

if (import.meta.url.startsWith('file:')) {
  const modulePath = url.fileURLToPath(import.meta.url);
  if (process.argv[1] === modulePath) {
    void main();
  }
}

export default main;
export { mainWithDeps };
