import type { LintDomainPlugin } from './engine.js';
import {
  collectFilesByExtensions,
  relativizeFiles,
  resolveSearchRootsFromPatterns,
} from './files.js';
import * as utils from '../utils.js';

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

/* eslint-disable no-console */
function createESLintDomainPlugin(): LintDomainPlugin {
  return {
    domain: 'eslint',
    detect: ({ eslintPatterns }) => {
      const patterns =
        eslintPatterns != null && eslintPatterns.length > 0
          ? eslintPatterns
          : DEFAULT_ESLINT_SEARCH_ROOTS;
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
    run: async ({ fix, chosenConfig, isConfigValid, eslintPatterns }) => {
      if (!isConfigValid) {
        console.error('Skipping ESLint due to invalid --config path.');
        return { hadFailure: true };
      }

      try {
        const hadLintingErrors = await utils.runESLint({
          fix,
          configPath: chosenConfig,
          explicitGlobs: eslintPatterns,
        });

        return { hadFailure: hadLintingErrors };
      } catch (err) {
        console.error(`ESLint failed: \n${err}`);
        return { hadFailure: true };
      }
    },
  };
}
/* eslint-enable no-console */

export { createESLintDomainPlugin };
