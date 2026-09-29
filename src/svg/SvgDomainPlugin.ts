import type {
  LintDomainDetection,
  LintDomainEngineContext,
  LintDomainPluginResult,
} from '../types.js';
import os from 'node:os';
import process from 'node:process';
import childProcess from 'node:child_process';
import { createRequire } from 'node:module';
import LintDomainPluginBase from '../LintDomainPluginBase.js';
import { resolveFilesFromPatterns } from '../utils.js';

const platform = os.platform();
const SVG_FILE_EXTENSIONS = ['.svg'] as const;

function collectSvgFilesFromScope(patterns: readonly string[]): string[] {
  return resolveFilesFromPatterns(patterns, SVG_FILE_EXTENSIONS);
}

function resolveSvgPatterns(
  svgPatterns: readonly string[] | undefined,
  defaultSearchRoots: readonly string[],
): string[] {
  return svgPatterns != null && svgPatterns.length > 0
    ? [...svgPatterns]
    : [...defaultSearchRoots];
}

class SvgDomainPlugin extends LintDomainPluginBase {
  public readonly domain = 'svg';
  public readonly description = 'Format and check SVG files with Prettier.';

  public constructor(
    private readonly prettierConfigPath: string,
    private readonly defaultSearchRoots: readonly string[],
  ) {
    super();
  }

  public detect({ svgPatterns }: LintDomainEngineContext): LintDomainDetection {
    const patterns = resolveSvgPatterns(svgPatterns, this.defaultSearchRoots);
    const matchedFiles = collectSvgFilesFromScope(patterns);

    return {
      relevant: matchedFiles.length > 0,
      relevanceReason:
        matchedFiles.length > 0
          ? undefined
          : 'No SVG files matched in effective scope.',
      available: true,
      availabilityKind: 'required' as const,
      matchedFiles,
    };
  }

  public run(
    { fix, logger }: LintDomainEngineContext,
    detection: LintDomainDetection,
  ): LintDomainPluginResult {
    const svgFiles = detection.matchedFiles ?? [];
    if (svgFiles.length === 0) {
      return { hadFailure: false };
    }

    const prettierArgs = [
      '--config',
      this.prettierConfigPath,
      '--config-precedence',
      'cli-override',
      '--no-editorconfig',
      '--parser',
      'html',
      fix ? '--write' : '--check',
      ...svgFiles,
    ];

    logger.info('Running prettier for SVG:');

    const require = createRequire(import.meta.url);
    let prettierBin: string | null = null;
    try {
      // Resolves to @matrixai/lint/node_modules/prettier/bin/prettier.cjs
      prettierBin = require.resolve('prettier/bin/prettier.cjs');
    } catch {
      // Bundled copy not found
    }

    try {
      if (prettierBin) {
        logger.info(
          `Running prettier command: ${process.execPath} ${prettierBin} ${prettierArgs.join(' ')}`,
        );
        childProcess.execFileSync(
          process.execPath,
          [prettierBin, ...prettierArgs],
          {
            stdio: 'inherit',
            windowsHide: true,
            encoding: 'utf-8',
            cwd: process.cwd(),
          },
        );
      } else {
        logger.info(
          `Running prettier command: prettier ${prettierArgs.join(' ')}`,
        );
        childProcess.execFileSync('prettier', prettierArgs, {
          stdio: 'inherit',
          windowsHide: true,
          encoding: 'utf-8',
          shell: platform === 'win32',
          cwd: process.cwd(),
        });
      }
    } catch (err) {
      const errorDetail = this.normalizeLogDetail(err);
      if (!fix) {
        logger.error(
          errorDetail.length > 0
            ? `SVG prettier check failed. ${errorDetail}`
            : 'SVG prettier check failed.',
        );
      } else {
        logger.error(
          errorDetail.length > 0
            ? `SVG prettier write failed. ${errorDetail}`
            : 'SVG prettier write failed.',
        );
      }

      return { hadFailure: true };
    }

    return { hadFailure: false };
  }
}

export default SvgDomainPlugin;
