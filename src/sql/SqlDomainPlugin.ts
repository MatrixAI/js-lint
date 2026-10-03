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

const SQL_FILE_EXTENSIONS = ['.sql'] as const;

function resolveSqlPatterns(
  sqlPatterns: readonly string[] | undefined,
  defaultSearchPatterns: readonly string[],
): string[] {
  return sqlPatterns != null && sqlPatterns.length > 0
    ? [...sqlPatterns]
    : [...defaultSearchPatterns];
}

class SqlDomainPlugin extends LintDomainPluginBase {
  public readonly domain = 'sql';
  public readonly description =
    'Lint and format SQL files with SQLFluff when available.';

  public constructor(
    private readonly defaultSearchPatterns: readonly string[],
  ) {
    super();
  }

  public detect({ sqlPatterns }: LintDomainEngineContext): LintDomainDetection {
    const patterns = resolveSqlPatterns(
      sqlPatterns,
      this.defaultSearchPatterns,
    );
    const matchedFiles = resolveFilesFromPatterns(
      patterns,
      SQL_FILE_EXTENSIONS,
    );
    const hasSqlfluff = commandExists('sqlfluff');

    return {
      relevant: matchedFiles.length > 0,
      relevanceReason:
        matchedFiles.length > 0
          ? undefined
          : 'No SQL files matched in effective scope.',
      available: hasSqlfluff,
      availabilityKind: 'optional' as const,
      unavailableReason: hasSqlfluff
        ? undefined
        : 'sqlfluff not found in environment.',
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

    const sqlfluffArgs = fix
      ? ['fix', '--force', ...matchedFiles]
      : ['lint', ...matchedFiles];

    logger.info(fix ? 'Running sqlfluff fix:' : 'Running sqlfluff lint:');
    logger.info(`Running sqlfluff command: sqlfluff ${sqlfluffArgs.join(' ')}`);

    try {
      childProcess.execFileSync('sqlfluff', sqlfluffArgs, {
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
            ? `SQLFluff lint failed. ${errorDetail}`
            : 'SQLFluff lint failed.',
        );
      } else {
        logger.error(
          errorDetail.length > 0
            ? `SQLFluff fix failed. ${errorDetail}`
            : 'SQLFluff fix failed.',
        );
      }
      return { hadFailure: true };
    }
  }
}

export default SqlDomainPlugin;
