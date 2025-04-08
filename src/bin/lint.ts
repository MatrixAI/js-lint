#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';
import process from 'node:process';
import childProcess from 'node:child_process';
import { runESLint } from '../runners/runESlint.js';
console.log("running custom linter");  

function commandExists(cmd: string): boolean {
  const whichCmd = process.platform === 'win32' ? 'where' : 'which';
  const result = childProcess.spawnSync(whichCmd, [cmd], { stdio: 'ignore' });
  return result.status === 0;
}

const projectPath = path.dirname(
  path.dirname(url.fileURLToPath(import.meta.url)),
);

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
  // Linting code
  // const eslintArgs = restArgs.length > 0 ? restArgs : [
  //   '{src,pages,blog,docs,server,scripts,benches,fixtures}/**/*.{js,mjs,ts,mts,jsx,tsx,json}',
  //   'docusaurus.config.ts',
  // ];
  // if (fix) {
  //   eslintArgs.push('--fix');
  // }
  console.error('Running eslint:');
  await runESLint({ fix });
  // console.error(['eslint', ...eslintArgs].join(' '));

  // Commenting out the shellcheck and prettier commands for now
  // because they are not working as expected and will need to be implemented later

  // // Linting shell scripts (this does not have auto-fixing)
  // const shellCheckArgs = [
  //   './src',
  //   './scripts',
  //   '-type',
  //   'f',
  //   '-regextype',
  //   'posix-extended',
  //   '-regex',
  //   '.*\\.(sh)',
  //   '-exec',
  //   'shellcheck',
  //   '{}',
  //   '+',
  // ];
  // if (commandExists('find') && commandExists('shellcheck')) {
  //   console.error('Running shellcheck:');
  //   console.error(['find', ...shellCheckArgs].join(' '));
  //   childProcess.execFileSync('find', shellCheckArgs, {
  //     stdio: ['inherit', 'inherit', 'inherit'],
  //     windowsHide: true,
  //     encoding: 'utf-8',
  //     shell: platform === 'win32' ? true : false,
  //     cwd: projectPath,
  //   });
  // } else {
  //   console.warn(
  //     'Skipping shellcheck: find or shellcheck not found in environment.',
  //   );
  // }

  // // Linting markdown
  // const prettierArgs = [
  //   !fix ? '--check' : '--write',
  //   './README.md',
  //   '{pages,blog,docs}/**/*.{md,mdx}',
  // ];
  // console.error('Running prettier:');
  // console.error(['prettier', ...prettierArgs].join(' '));
  // childProcess.execFileSync('prettier', prettierArgs, {
  //   stdio: ['inherit', 'inherit', 'inherit'],
  //   windowsHide: true,
  //   encoding: 'utf-8',
  //   shell: platform === 'win32' ? true : false,
  //   cwd: projectPath,
  // });
}



/* eslint-enable no-console */

export default main;

console.log('process.argv[1]:', process.argv[1]);
console.log('modulePath:', projectPath);

if (import.meta.url.startsWith('file:')) {
  const modulePath = url.fileURLToPath(import.meta.url);
  void main();
//   if (process.argv[1] === modulePath) {
//     console.log("try run main");
//     void main();
//   }
}
