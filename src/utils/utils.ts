import path from 'node:path';
import process from 'node:process';
import childProcess from 'node:child_process';
import fs from 'fs';
import glob from 'fast-glob';
import ts from 'typescript';

const DEFAULT_IGNORE = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/.turbo/**',
];

/**
 * Find all `tsconfig.json` files in the current working directory.
 * It looks for the following files:
 * - tsconfig.json
 *
 * @param repoRoot The root directory of the repository (default: process.cwd())
 * @returns An array of paths to `tsconfig.json` files.
 */
function findTsconfigFiles(repoRoot = process.cwd()) {
  return glob.sync('tsconfig.json', {
    cwd: repoRoot,
    absolute: true,
    deep: 1,
    ignore: DEFAULT_IGNORE,
  });
}

/**
 * Find the user's ESLint config file in the current working directory.
 * It looks for the following files:
 * - eslint.config.js
 * - eslint.config.mjs
 * - eslint.config.cjs
 * - eslint.config.ts
 *
 * @param repoRoot The root directory of the repository (default: process.cwd())
 * @returns The path to the ESLint config file, or null if not found.
 */
function findUserESLintConfig(repoRoot = process.cwd()): string | null {
  const candidates = [
    'eslint.config.js',
    'eslint.config.mjs',
    'eslint.config.cjs',
    'eslint.config.ts',
  ];
  for (const file of candidates) {
    const abs = path.join(repoRoot, file);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

function loadTsconfigIncludes(tsconfigPaths: string | string[]): string[] {
  const paths = Array.isArray(tsconfigPaths) ? tsconfigPaths : [tsconfigPaths];
  const includes: string[] = [];

  for (const cfgPath of paths) {
    // Ts.readConfigFile handles JSONC and returns `{ config, error }`
    const { config, error } = ts.readConfigFile(cfgPath, ts.sys.readFile);

    if (error) {
      // Non‑fatal: just warn and continue
      const msg = ts.flattenDiagnosticMessageText(error.messageText, '\n');
      console.warn(`Skipping ${cfgPath}: ${msg}`);
      continue;
    }

    if (Array.isArray(config.include)) {
      includes.push(...config.include);
    }
  }

  return includes;
}

function loadTsconfigExcludes(tsconfigPaths: string | string[]): string[] {
  const paths = Array.isArray(tsconfigPaths) ? tsconfigPaths : [tsconfigPaths];
  const excludes: string[] = [];

  for (const tsconfigPath of paths) {
    const tsconfigText = fs.readFileSync(tsconfigPath, 'utf-8');
    const tsconfig = JSON.parse(tsconfigText);
    const normalizedExcludes = (tsconfig.exclude ?? []).map((exclude: string) =>
      exclude.replace(/^(\.\/|\.\.\/)+/, ''),
    );
    excludes.push(...normalizedExcludes);
  }

  return excludes;
}

/**
 * Collect all Markdown files in a directory and its subdirectories.
 *
 * @param dir The directory to search in.
 * @returns An array of paths to Markdown files.
 */
function collectMarkdown(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      files.push(...collectMarkdown(p));
    } else if (e.isFile() && /\.(md|mdx)$/i.test(e.name)) {
      files.push(p);
    }
  }
  return files;
}

/**
 * Check if a command exists in the system PATH.
 *
 * @param cmd The command to check.
 * @returns True if the command exists, false otherwise.
 */
function commandExists(cmd: string): boolean {
  const whichCmd = process.platform === 'win32' ? 'where' : 'which';
  const result = childProcess.spawnSync(whichCmd, [cmd], { stdio: 'ignore' });
  return result.status === 0;
}

export {
  findUserESLintConfig,
  collectMarkdown,
  commandExists,
};
