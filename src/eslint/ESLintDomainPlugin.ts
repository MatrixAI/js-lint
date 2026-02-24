import type {
  LintDomainDetection,
  LintDomainEngineContext,
  LintDomainPluginResult,
} from '../types.js';
import { buildPatterns, runESLint } from './utils.js';
import LintDomainPluginBase from '../LintDomainPluginBase.js';
import { resolveLintConfig } from '../config.js';
import {
  resolveFilesFromPatterns,
  resolveSearchRootsFromPatterns,
} from '../utils.js';

const ESLINT_FILE_EXTENSIONS = [
  '.js',
  '.mjs',
  '.cjs',
  '.jsx',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.json',
] as const;

const DEFAULT_ESLINT_SEARCH_ROOTS = ['./src', './scripts', './tests'];

function resolveESLintDetectionPatterns(
  eslintPatterns: readonly string[] | undefined,
): string[] {
  if (eslintPatterns != null && eslintPatterns.length > 0) {
    return [...eslintPatterns];
  }

  const resolvedConfig = resolveLintConfig();
  const { tsconfigPaths, forceInclude } = resolvedConfig.domains.eslint;

  if (tsconfigPaths.length === 0) {
    return DEFAULT_ESLINT_SEARCH_ROOTS;
  }

  const { files } = buildPatterns(
    tsconfigPaths,
    forceInclude,
    process.cwd(),
    resolvedConfig.root,
  );
  if (files.length === 0) {
    return DEFAULT_ESLINT_SEARCH_ROOTS;
  }

  return files;
}

class ESLintDomainPlugin extends LintDomainPluginBase {
  public readonly domain = 'eslint';
  public readonly description =
    'Lint JavaScript/TypeScript/JSON files with ESLint.';

  public detect({
    eslintPatterns,
  }: LintDomainEngineContext): LintDomainDetection {
    if (eslintPatterns != null && eslintPatterns.length > 0) {
      const searchRoots = resolveSearchRootsFromPatterns(eslintPatterns);

      return {
        relevant: searchRoots.length > 0,
        relevanceReason:
          searchRoots.length > 0
            ? undefined
            : 'No ESLint-supported files matched in effective scope.',
        available: true,
        availabilityKind: 'required' as const,
      };
    }

    const detectionPatterns = resolveESLintDetectionPatterns(eslintPatterns);
    const matchedFiles = resolveFilesFromPatterns(
      detectionPatterns,
      ESLINT_FILE_EXTENSIONS,
    );

    return {
      relevant: matchedFiles.length > 0,
      relevanceReason:
        matchedFiles.length > 0
          ? undefined
          : 'No ESLint-supported files matched in effective scope.',
      available: true,
      availabilityKind: 'required' as const,
      matchedFiles,
    };
  }

  public async run({
    fix,
    logger,
    chosenConfig,
    isConfigValid,
    eslintPatterns,
  }: LintDomainEngineContext): Promise<LintDomainPluginResult> {
    if (!isConfigValid) {
      logger.error('Skipping ESLint due to invalid --eslint-config path.');
      return { hadFailure: true };
    }

    try {
      const explicitPatterns =
        eslintPatterns != null && eslintPatterns.length > 0
          ? resolveFilesFromPatterns(eslintPatterns, ESLINT_FILE_EXTENSIONS)
          : undefined;
      const hadLintingErrors = await runESLint({
        fix,
        logger,
        configPath: chosenConfig,
        explicitGlobs: explicitPatterns,
      });

      return { hadFailure: hadLintingErrors };
    } catch (err) {
      const errorDetail = this.normalizeLogDetail(err);
      logger.error(
        errorDetail.length > 0
          ? `ESLint failed. ${errorDetail}`
          : 'ESLint failed.',
      );
      return { hadFailure: true };
    }
  }
}

export default ESLintDomainPlugin;
