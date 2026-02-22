import type { LintDomainPlugin } from './engine.js';
import os from 'node:os';
import process from 'node:process';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import {
  collectFilesByExtensions,
  relativizeFiles,
  resolveSearchRootsFromPatterns,
} from './files.js';

const platform = os.platform();
const MARKDOWN_FILE_EXTENSIONS = ['.md', '.mdx'] as const;
const DEFAULT_MARKDOWN_ROOT_FILES = ['README.md', 'AGENTS.md'] as const;
const DEFAULT_MARKDOWN_SEARCH_ROOTS = [
  './README.md',
  './AGENTS.md',
  './pages',
  './blog',
  './docs',
];

function collectMarkdownFilesFromScope(
  searchRoots: readonly string[],
): string[] {
  const matchedFiles = collectFilesByExtensions(
    searchRoots,
    MARKDOWN_FILE_EXTENSIONS,
  );
  const matchedRelativeFiles = relativizeFiles(matchedFiles);

  for (const rootFile of [...DEFAULT_MARKDOWN_ROOT_FILES].reverse()) {
    if (!matchedRelativeFiles.includes(rootFile) && fs.existsSync(rootFile)) {
      matchedRelativeFiles.unshift(rootFile);
    }
  }

  return matchedRelativeFiles;
}

function createMarkdownDomainPlugin({
  prettierConfigPath,
}: {
  prettierConfigPath: string;
}): LintDomainPlugin {
  return {
    domain: 'markdown',
    description: 'Format and check Markdown/MDX files with Prettier.',
    detect: ({ markdownPatterns }) => {
      const searchPatterns =
        markdownPatterns != null && markdownPatterns.length > 0
          ? markdownPatterns
          : DEFAULT_MARKDOWN_SEARCH_ROOTS;
      const searchRoots = resolveSearchRootsFromPatterns(searchPatterns);
      const matchedFiles = collectMarkdownFilesFromScope(searchRoots);

      return {
        relevant: matchedFiles.length > 0,
        relevanceReason:
          matchedFiles.length > 0
            ? undefined
            : 'No Markdown/MDX files matched in effective scope.',
        available: true,
        availabilityKind: 'required' as const,
        matchedFiles,
      };
    },
    run: ({ fix, logger }, detection) => {
      const markdownFiles = detection.matchedFiles ?? [];
      if (markdownFiles.length === 0) {
        return { hadFailure: false };
      }

      const prettierArgs = [
        '--config',
        prettierConfigPath,
        '--config-precedence',
        'cli-override',
        '--no-editorconfig',
        fix ? '--write' : '--check',
        ...markdownFiles,
      ];

      logger.info('Running prettier:');

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
          logger.info(` ${prettierBin} \n ${prettierArgs.join('\n' + ' ')}`);
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
          logger.info('prettier ' + prettierArgs.join('\n' + ' '));
          childProcess.execFileSync('prettier', prettierArgs, {
            stdio: 'inherit',
            windowsHide: true,
            encoding: 'utf-8',
            shell: platform === 'win32',
            cwd: process.cwd(),
          });
        }
      } catch (err) {
        if (!fix) {
          logger.error('Prettier check failed.');
        } else {
          logger.error('Prettier write failed. ' + err);
        }

        return { hadFailure: true };
      }

      return { hadFailure: false };
    },
  };
}

export { createMarkdownDomainPlugin };
