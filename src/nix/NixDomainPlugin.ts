import type {
  LintDomainDetection,
  LintDomainEngineContext,
  LintDomainPluginResult,
} from '../types.js';
import os from 'node:os';
import process from 'node:process';
import childProcess from 'node:child_process';
import LintDomainPluginBase from '../LintDomainPluginBase.js';
import { commandExists, resolveFilesFromPatterns } from '../utils.js';

const platform = os.platform();

const NIX_FILE_EXTENSIONS = ['.nix'] as const;

function resolveNixPatterns(
  nixPatterns: readonly string[] | undefined,
  defaultSearchPatterns: readonly string[],
): string[] {
  return nixPatterns != null && nixPatterns.length > 0
    ? [...nixPatterns]
    : [...defaultSearchPatterns];
}

class NixDomainPlugin extends LintDomainPluginBase {
  public readonly domain = 'nix';
  public readonly description =
    'Format and check Nix files with nixfmt when available.';

  public constructor(
    private readonly defaultSearchPatterns: readonly string[],
  ) {
    super();
  }

  public detect({ nixPatterns }: LintDomainEngineContext): LintDomainDetection {
    const patterns = resolveNixPatterns(
      nixPatterns,
      this.defaultSearchPatterns,
    );
    const matchedFiles = resolveFilesFromPatterns(
      patterns,
      NIX_FILE_EXTENSIONS,
    );
    const hasNixfmt = commandExists('nixfmt');

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
  }

  public run(
    { fix, logger }: LintDomainEngineContext,
    detection: LintDomainDetection,
  ): LintDomainPluginResult {
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
      const errorDetail = this.normalizeLogDetail(err);
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
  }
}

export default NixDomainPlugin;
