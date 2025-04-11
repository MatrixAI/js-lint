#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import childProcess from 'node:child_process';
import fs from 'fs';
import { runESLint } from '../runners/runESlint.js';
import * as utils from '../utils/index.js';

const platform = os.platform();

/* eslint-disable no-console */
async function main(argv = process.argv) {
  argv = argv.slice(2);

  let fix = false;
  let useUserConfig = false;
  let explicitConfigPath: string | undefined;
  const restArgs: string[] = [];

  while (argv.length > 0) {
    const option = argv.shift()!;
    switch (option) {
      case '--fix':
        fix = true;
        break;
      case '--user-config':
        useUserConfig = true;
        break;
      case '--config':
        explicitConfigPath = argv.shift(); // Grab the next token
        break;
      default:
        restArgs.push(option);
    }
  }

  // Resolve which config file to use
  let chosenConfig: string | undefined;

  if (explicitConfigPath) {
    const abs = path.resolve(explicitConfigPath);

    if (!fs.existsSync(abs)) {
      console.error(
        `--config points to “${explicitConfigPath}”, but that file does not exist.`,
      );
      process.exit(1); // Hard‑fail; nothing to lint against
    }

    chosenConfig = abs;
  } else if (useUserConfig) {
    chosenConfig = utils.findUserESLintConfig() ?? undefined;
    if (!chosenConfig) {
      console.error(
        '--user-config given but no local ESLint config was found. Falling back to built-in config.',
      );
    }
  }

  console.error('Running eslint:');
  runESLint({ fix, configPath: chosenConfig }).catch((err) => {
    console.error('ESLint failed:', err);
    process.exit(1);
  });

  // Linting shell scripts (this does not have auto-fixing)
  const shellCheckArgs = [
    './src',
    './scripts',
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
    console.error(['find', ...shellCheckArgs].join(' '));
    childProcess.execFileSync('find', shellCheckArgs, {
      stdio: ['inherit', 'inherit', 'inherit'],
      windowsHide: true,
      encoding: 'utf-8',
      shell: platform === 'win32' ? true : false,
      cwd: process.cwd(),
    });
  } else {
    console.warn(
      'Skipping shellcheck: find or shellcheck not found in environment.',
    );
  }

  // Linting markdown files
  // Always include README if it exists
  const markdownFiles: string[] = [];
  if (fs.existsSync('README.md')) markdownFiles.push('README.md');

  // Add files from pages/, blog/, docs/ **if they exist AND contain md/mdx**
  for (const dir of ['pages', 'blog', 'docs']) {
    if (fs.existsSync(dir)) {
      markdownFiles.push(...utils.collectMarkdown(dir));
    }
  }

  if (markdownFiles.length === 0) {
    console.warn('Skipping Prettier: no Markdown/MDX files found.');
    return;
  }

  const prettierArgs = [fix ? '--write' : '--check', ...markdownFiles];

  console.error('Running prettier:');
  console.error(['prettier', ...prettierArgs].join(' '));

  childProcess.execFileSync('prettier', prettierArgs, {
    stdio: 'inherit',
    windowsHide: true,
    encoding: 'utf-8',
    shell: platform === 'win32',
    cwd: process.cwd(),
  });
}

/* eslint-enable no-console */

export default main;

if (import.meta.url.startsWith('file:')) {
  void main();
}
