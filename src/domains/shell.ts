import type { LintDomainPlugin } from './engine.js';
import os from 'node:os';
import process from 'node:process';
import childProcess from 'node:child_process';
import {
  collectFilesByExtensions,
  relativizeFiles,
  resolveSearchRootsFromPatterns,
} from './files.js';
import * as utils from '../utils.js';

const platform = os.platform();

const SHELL_FILE_EXTENSIONS = ['.sh'] as const;

/* eslint-disable no-console */
function createShellDomainPlugin({
  defaultSearchRoots,
}: {
  defaultSearchRoots: readonly string[];
}): LintDomainPlugin {
  return {
    domain: 'shell',
    detect: ({ shellPatterns }) => {
      const patterns =
        shellPatterns != null && shellPatterns.length > 0
          ? shellPatterns
          : [...defaultSearchRoots];
      const searchRoots = resolveSearchRootsFromPatterns(patterns);
      const matchedFiles = collectFilesByExtensions(
        searchRoots,
        SHELL_FILE_EXTENSIONS,
      );
      const matchedRelativeFiles = relativizeFiles(matchedFiles);
      const hasShellcheck = utils.commandExists('shellcheck');

      return {
        relevant: matchedRelativeFiles.length > 0,
        relevanceReason:
          matchedRelativeFiles.length > 0
            ? undefined
            : 'No shell script files matched in effective scope.',
        available: hasShellcheck,
        availabilityKind: 'optional' as const,
        unavailableReason: hasShellcheck
          ? undefined
          : 'shellcheck not found in environment.',
        matchedFiles: matchedRelativeFiles,
      };
    },
    run: (_context, detection) => {
      const matchedFiles = detection.matchedFiles ?? [];
      if (matchedFiles.length === 0) {
        return { hadFailure: false };
      }

      console.error('Running shellcheck:');
      console.error(' ' + ['shellcheck', ...matchedFiles].join(' '));

      try {
        childProcess.execFileSync('shellcheck', matchedFiles, {
          stdio: ['inherit', 'inherit', 'inherit'],
          windowsHide: true,
          encoding: 'utf-8',
          shell: platform === 'win32',
          cwd: process.cwd(),
        });

        return { hadFailure: false };
      } catch (err) {
        console.error('Shellcheck failed. ' + err);
        return { hadFailure: true };
      }
    },
  };
}
/* eslint-enable no-console */

export { createShellDomainPlugin };
