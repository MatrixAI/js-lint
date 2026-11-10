import type {
  LintDomainDetection,
  LintDomainEngineContext,
  LintDomainPluginResult,
} from '../types.js';
import ESLintScope from './ESLintScope.js';
import ESLintRunner from './ESLintRunner.js';
import LintDomainPluginBase from '../LintDomainPluginBase.js';
import { resolveLintConfig } from '../config.js';
import { DEFAULT_ESLINT_SEARCH_ROOTS } from '../constants.js';
import FileDiscovery from '../FileDiscovery.js';

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

function resolveESLintDetectionPatterns(
  eslintPatterns: readonly string[] | undefined,
): string[] {
  if (eslintPatterns != null && eslintPatterns.length > 0) {
    return [...eslintPatterns];
  }

  const resolvedConfig = resolveLintConfig();
  const { tsconfigPaths, forceInclude } = resolvedConfig.domains.eslint;

  if (tsconfigPaths.length === 0) {
    return [...DEFAULT_ESLINT_SEARCH_ROOTS];
  }

  const { files } = new ESLintScope().buildPatterns(
    tsconfigPaths,
    forceInclude,
    process.cwd(),
    resolvedConfig.root,
  );
  if (files.length === 0) {
    return [...DEFAULT_ESLINT_SEARCH_ROOTS];
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
    if (eslintPatterns != null) {
      const searchRoots = new FileDiscovery().resolveSearchRootsFromPatterns(
        eslintPatterns,
      );

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
    const matchedFiles = new FileDiscovery().resolveFilesFromPatterns(
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
          ? new FileDiscovery().resolveFilesFromPatterns(
              eslintPatterns,
              ESLINT_FILE_EXTENSIONS,
            )
          : undefined;
      const hadLintingErrors = await new ESLintRunner(logger).run({
        fix,
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
