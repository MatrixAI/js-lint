import type { LintDomainPlugin } from './engine.js';
import {
  resolveFilesFromPatterns,
  resolveSearchRootsFromPatterns,
} from './files.js';
import * as utils from '../utils.js';
import { resolveLintConfig } from '../config.js';

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

  const { files } = utils.buildPatterns(
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

function createESLintDomainPlugin(): LintDomainPlugin {
  return {
    domain: 'eslint',
    description: 'Lint JavaScript/TypeScript/JSON files with ESLint.',
    detect: ({ eslintPatterns }) => {
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
    },
    run: async ({
      fix,
      logger,
      chosenConfig,
      isConfigValid,
      eslintPatterns,
    }) => {
      if (!isConfigValid) {
        logger.error('Skipping ESLint due to invalid --eslint-config path.');
        return { hadFailure: true };
      }

      try {
        const explicitPatterns =
          eslintPatterns != null && eslintPatterns.length > 0
            ? resolveFilesFromPatterns(eslintPatterns, ESLINT_FILE_EXTENSIONS)
            : undefined;
        const hadLintingErrors = await utils.runESLint({
          fix,
          logger,
          configPath: chosenConfig,
          explicitGlobs: explicitPatterns,
        });

        return { hadFailure: hadLintingErrors };
      } catch (err) {
        logger.error(`ESLint failed: \n${err}`);
        return { hadFailure: true };
      }
    },
  };
}

export { createESLintDomainPlugin };
