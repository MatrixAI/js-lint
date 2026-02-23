import type { LintDomainPlugin } from './engine.js';
import os from 'node:os';
import process from 'node:process';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { resolveFilesFromPatterns } from './files.js';

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

function normalizeLogDetail(value: unknown): string {
  return String(value)
    .replace(/\r?\n+/g, ' | ')
    .trim();
}

function collectMarkdownFilesFromScope(patterns: readonly string[]): string[] {
  const matchedRelativeFiles = resolveFilesFromPatterns(
    patterns,
    MARKDOWN_FILE_EXTENSIONS,
  );

  for (const rootFile of [...DEFAULT_MARKDOWN_ROOT_FILES].reverse()) {
    if (!matchedRelativeFiles.includes(rootFile) && fs.existsSync(rootFile)) {
      matchedRelativeFiles.unshift(rootFile);
    }
  }

  return matchedRelativeFiles;
}

function resolveMarkdownPatterns(
  markdownPatterns: readonly string[] | undefined,
): string[] {
  return markdownPatterns != null && markdownPatterns.length > 0
    ? [...markdownPatterns]
    : [...DEFAULT_MARKDOWN_SEARCH_ROOTS];
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
      const patterns = resolveMarkdownPatterns(markdownPatterns);
      const matchedFiles = collectMarkdownFilesFromScope(patterns);

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
        const errorDetail = normalizeLogDetail(err);
        if (!fix) {
          logger.error(
            errorDetail.length > 0
              ? `Prettier check failed. ${errorDetail}`
              : 'Prettier check failed.',
          );
        } else {
          logger.error(
            errorDetail.length > 0
              ? `Prettier write failed. ${errorDetail}`
              : 'Prettier write failed.',
          );
        }

        return { hadFailure: true };
      }

      return { hadFailure: false };
    },
  };
}

export { createMarkdownDomainPlugin };
