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

const SHELL_FILE_EXTENSIONS = ['.sh'] as const;

function resolveShellPatterns(
  shellPatterns: readonly string[] | undefined,
  defaultSearchRoots: readonly string[],
): string[] {
  return shellPatterns != null && shellPatterns.length > 0
    ? [...shellPatterns]
    : [...defaultSearchRoots];
}

class ShellDomainPlugin extends LintDomainPluginBase {
  public readonly domain = 'shell';
  public readonly description =
    'Lint shell scripts with shellcheck when available.';

  public constructor(private readonly defaultSearchRoots: readonly string[]) {
    super();
  }

  public detect({
    shellPatterns,
  }: LintDomainEngineContext): LintDomainDetection {
    const patterns = resolveShellPatterns(
      shellPatterns,
      this.defaultSearchRoots,
    );
    const matchedFiles = resolveFilesFromPatterns(
      patterns,
      SHELL_FILE_EXTENSIONS,
    );
    const hasShellcheck = commandExists('shellcheck');

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
  }

  public run(
    { logger }: LintDomainEngineContext,
    detection: LintDomainDetection,
  ): LintDomainPluginResult {
    const matchedFiles = detection.matchedFiles ?? [];
    if (matchedFiles.length === 0) {
      return { hadFailure: false };
    }

    logger.info('Running shellcheck:');
    logger.info(
      `Running shellcheck command: shellcheck ${matchedFiles.join(' ')}`,
    );

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
      const errorDetail = this.normalizeLogDetail(err);
      logger.error(
        errorDetail.length > 0
          ? `Shellcheck failed. ${errorDetail}`
          : 'Shellcheck failed.',
      );
      return { hadFailure: true };
    }
  }
}

export default ShellDomainPlugin;
