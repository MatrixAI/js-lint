#!/usr/bin/env node

import os from 'node:os';
import path from 'node:path';
import url from 'node:url';
import process from 'node:process';
import fs from 'node:fs';
import childProcess from 'node:child_process';

const projectPath = path.dirname(
  path.dirname(url.fileURLToPath(import.meta.url)),
);

const platform = os.platform();

/* eslint-disable no-console */
async function main(argv = process.argv) {
  argv = argv.slice(2);
  const tscArgs = [`-p`, path.join(projectPath, 'tsconfig.build.json')];
  console.error('Running tsc:');
  console.error(['tsc', ...tscArgs].join(' '));
  childProcess.execFileSync('tsc', tscArgs, {
    stdio: ['inherit', 'inherit', 'inherit'],
    windowsHide: true,
    encoding: 'utf-8',
    shell: platform === 'win32' ? true : false,
  });
  const jestArgs = [...argv];
  console.error('Running jest:');
  console.error(['jest', ...jestArgs].join(' '));
  childProcess.execFileSync('jest', jestArgs, {
    env: {
      ...process.env,
      NODE_OPTIONS: '--experimental-vm-modules',
    },
    stdio: ['inherit', 'inherit', 'inherit'],
    windowsHide: true,
    encoding: 'utf-8',
    shell: platform === 'win32' ? true : false,
  });
}
/* eslint-enable no-console */

if (import.meta.url.startsWith('file:') && process.argv[1] != null) {
  const entryPath = process.argv[1];
  let entryUrl;
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
