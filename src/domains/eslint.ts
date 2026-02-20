import type { LintDomainPlugin } from './engine.js';
import {
  collectFilesByExtensions,
  relativizeFiles,
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
      const patterns = resolveESLintDetectionPatterns(eslintPatterns);
      const searchRoots = resolveSearchRootsFromPatterns(patterns);
      const matchedFiles = collectFilesByExtensions(
        searchRoots,
        ESLINT_FILE_EXTENSIONS,
      );
      const matchedRelativeFiles = relativizeFiles(matchedFiles);

      return {
        relevant: matchedRelativeFiles.length > 0,
        relevanceReason:
          matchedRelativeFiles.length > 0
            ? undefined
            : 'No ESLint-supported files matched in effective scope.',
        available: true,
        availabilityKind: 'required' as const,
        matchedFiles: matchedRelativeFiles,
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
        const hadLintingErrors = await utils.runESLint({
          fix,
          logger,
          configPath: chosenConfig,
          explicitGlobs: eslintPatterns,
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
