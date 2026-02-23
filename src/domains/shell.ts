import type { LintDomainPlugin } from './engine.js';
import os from 'node:os';
import process from 'node:process';
import childProcess from 'node:child_process';
import { resolveFilesFromPatterns } from './files.js';
import * as utils from '../utils.js';

const platform = os.platform();

const SHELL_FILE_EXTENSIONS = ['.sh'] as const;

function resolveShellPatterns(
  shellPatterns: readonly string[] | undefined,
  defaultSearchRoots: readonly string[],
): string[] {
  return shellPatterns != null && shellPatterns.length > 0
    ? [...shellPatterns]
    : [...defaultSearchRoots];
}

function createShellDomainPlugin({
  defaultSearchRoots,
}: {
  defaultSearchRoots: readonly string[];
}): LintDomainPlugin {
  return {
    domain: 'shell',
    description: 'Lint shell scripts with shellcheck when available.',
    detect: ({ shellPatterns }) => {
      const patterns = resolveShellPatterns(shellPatterns, defaultSearchRoots);
      const matchedFiles = resolveFilesFromPatterns(
        patterns,
        SHELL_FILE_EXTENSIONS,
      );
      const hasShellcheck = utils.commandExists('shellcheck');

      return {
        relevant: matchedFiles.length > 0,
        relevanceReason:
          matchedFiles.length > 0
            ? undefined
            : 'No shell script files matched in effective scope.',
        available: hasShellcheck,
        availabilityKind: 'optional' as const,
        unavailableReason: hasShellcheck
          ? undefined
          : 'shellcheck not found in environment.',
        matchedFiles,
      };
    },
    run: ({ logger }, detection) => {
      const matchedFiles = detection.matchedFiles ?? [];
      if (matchedFiles.length === 0) {
        return { hadFailure: false };
      }

      logger.info('Running shellcheck:');
      logger.info(' ' + ['shellcheck', ...matchedFiles].join(' '));

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
        logger.error('Shellcheck failed. ' + err);
        return { hadFailure: true };
      }
    },
  };
}

export { createShellDomainPlugin };
