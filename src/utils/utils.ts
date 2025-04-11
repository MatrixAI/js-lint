import path from 'node:path';
import process from 'node:process';
import childProcess from 'node:child_process';
import fs from 'fs';
import glob from 'fast-glob';

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
    deep: 1, // Only look at top-level (or you can use deep: true for nested)
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

/**
 * Load the `include` property from a `tsconfig.json` file.
 *
 * @param tsconfigPath The path to the `tsconfig.json` file.
 * @returns An array of paths included in the `include` property.
 */
function loadTsconfigIncludes(tsconfigPath: string): string[] {
  const tsconfigText = fs.readFileSync(tsconfigPath, 'utf-8');
  const tsconfig = JSON.parse(tsconfigText);
  return [...(tsconfig.include ?? [])];
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
  findTsconfigFiles,
  findUserESLintConfig,
  loadTsconfigIncludes,
  collectMarkdown,
  commandExists,
};
