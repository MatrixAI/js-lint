#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import childProcess from 'node:child_process';
import fs from 'fs';
import { runESLint } from '../runners/runESlint.js';

/** Recursively collect *.md / *.mdx files under a directory */
function collectMarkdown(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      files.push(...collectMarkdown(p));
    } else if (e.isFile() && /\.(md|mdx)$/i.test(e.name)) {
      files.push(p);
    }
  }
  return files;
}

function commandExists(cmd: string): boolean {
  const whichCmd = process.platform === 'win32' ? 'where' : 'which';
  const result = childProcess.spawnSync(whichCmd, [cmd], { stdio: 'ignore' });
  return result.status === 0;
}

const platform = os.platform();

/* eslint-disable no-console */
async function main(argv = process.argv) {
  argv = argv.slice(2);
  let fix = false;
  const restArgs: string[] = [];
  while (argv.length > 0) {
    const option = argv.shift();
    if (option === '--fix') {
      fix = true;
      argv.shift();
    } else if (option !== undefined) {
      restArgs.push(option);
    }
  }

  console.error('Running eslint:');
  runESLint({ fix }).catch((err) => {
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
  if (commandExists('find') && commandExists('shellcheck')) {
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
      markdownFiles.push(...collectMarkdown(dir));
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
