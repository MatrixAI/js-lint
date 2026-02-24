import type { LintDomainPlugin } from './engine.js';
import os from 'node:os';
import process from 'node:process';
import childProcess from 'node:child_process';
import { resolveFilesFromPatterns } from './files.js';
import * as utils from '../utils.js';

const platform = os.platform();

const NIX_FILE_EXTENSIONS = ['.nix'] as const;

function normalizeLogDetail(value: unknown): string {
  return String(value)
    .replace(/\r?\n+/g, ' | ')
    .trim();
}

function resolveNixPatterns(
  nixPatterns: readonly string[] | undefined,
  defaultSearchPatterns: readonly string[],
): string[] {
  return nixPatterns != null && nixPatterns.length > 0
    ? [...nixPatterns]
    : [...defaultSearchPatterns];
}

function createNixDomainPlugin({
  defaultSearchPatterns,
}: {
  defaultSearchPatterns: readonly string[];
}): LintDomainPlugin {
  return {
    domain: 'nix',
    description: 'Format and check Nix files with nixfmt when available.',
    detect: ({ nixPatterns }) => {
      const patterns = resolveNixPatterns(nixPatterns, defaultSearchPatterns);
      const matchedFiles = resolveFilesFromPatterns(
        patterns,
        NIX_FILE_EXTENSIONS,
      );
      const hasNixfmt = utils.commandExists('nixfmt');

      return {
        relevant: matchedFiles.length > 0,
        relevanceReason:
          matchedFiles.length > 0
            ? undefined
            : 'No Nix files matched in effective scope.',
        available: hasNixfmt,
        availabilityKind: 'optional' as const,
        unavailableReason: hasNixfmt
          ? undefined
          : 'nixfmt not found in environment.',
        matchedFiles,
      };
    },
    run: ({ fix, logger }, detection) => {
      const matchedFiles = detection.matchedFiles ?? [];
      if (matchedFiles.length === 0) {
        return { hadFailure: false };
      }

      const nixfmtArgs = [...(fix ? [] : ['--check']), ...matchedFiles];

      logger.info(fix ? 'Running nixfmt write:' : 'Running nixfmt check:');
      logger.info(`Running nixfmt command: nixfmt ${nixfmtArgs.join(' ')}`);

      try {
        childProcess.execFileSync('nixfmt', nixfmtArgs, {
          stdio: ['inherit', 'inherit', 'inherit'],
          windowsHide: true,
          encoding: 'utf-8',
          shell: platform === 'win32',
          cwd: process.cwd(),
        });

        return { hadFailure: false };
      } catch (err) {
        const errorDetail = normalizeLogDetail(err);
        if (!fix) {
          logger.error(
            errorDetail.length > 0
              ? `nixfmt check failed. ${errorDetail}`
              : 'nixfmt check failed.',
          );
        } else {
          logger.error(
            errorDetail.length > 0
              ? `nixfmt write failed. ${errorDetail}`
              : 'nixfmt write failed.',
          );
        }
        return { hadFailure: true };
      }
    },
  };
}

export { createNixDomainPlugin };
