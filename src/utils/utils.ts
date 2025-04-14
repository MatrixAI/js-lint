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

interface MatrixAILintConfig {
  tsconfigPaths: string[];
  forceInclude: string[];
}

function resolveMatrixConfig(repoRoot = process.cwd()): MatrixAILintConfig {
  const cfgPath = path.join(repoRoot, 'matrixai-lint-config.json');

  const abs = (p: string) => path.resolve(repoRoot, p);
  const exists = (p: string) => fs.existsSync(p);

  let rawCfg: unknown = {};

  if (exists(cfgPath)) {
    try {
      const text = fs.readFileSync(cfgPath, 'utf8').trim();
      rawCfg = text.length ? JSON.parse(text) : {};
    } catch {
      console.error(
        '[matrixai‑lint]  ✖  matrixai-lint-config.json is not valid JSON – falling back to defaults.',
      );
    }
  }

  const toStringArray = (v: unknown): string[] =>
    typeof v === 'string'
      ? [v]
      : Array.isArray(v)
        ? v.filter((x): x is string => typeof x === 'string')
        : [];

  const cfg = rawCfg as { tsconfigPaths?: unknown; forceInclude?: unknown };

  const tsconfigPaths = toStringArray(cfg.tsconfigPaths)
    .map(abs)
    .filter((p) => {
      if (exists(p)) return true;
      console.warn(`[matrixai‑lint]  ⚠  tsconfig not found: ${p}`);
      return false;
    });

  const forceInclude = toStringArray(cfg.forceInclude).map((g) =>
    g.replace(/^\.\//, ''),
  );

  // Fallback to root tsconfig
  if (tsconfigPaths.length === 0) {
    const rootTs = path.join(repoRoot, 'tsconfig.json');
    if (exists(rootTs)) tsconfigPaths.push(rootTs);
  }

  return { tsconfigPaths, forceInclude };
}

interface Patterns {
  files: string[];
  ignore: string[];
}

function buildPatterns(
  tsconfigPath: string,
  forceInclude: string[] = [],
): Patterns {
  const { config } = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  const strip = (p: string) => p.replace(/^\.\//, '');

  const include = (config.include ?? []).map(strip);
  const exclude = (config.exclude ?? []).map(strip);

  // ForceInclude overrides exclude
  const ignore = exclude.filter(
    (ex) => !forceInclude.some((fi) => fi.startsWith(ex) || ex.startsWith(fi)),
  );

  const files = [
    ...include.map((g) => `${g}.{js,mjs,ts,mts,jsx,tsx,json}`),
    ...forceInclude.map((g) => `${g}.{js,mjs,ts,mts,jsx,tsx,json}`),
  ];

  if (!exclude.length) {
    ignore.push('node_modules/**', 'bower_components/**', 'jspm_packages/**');
  }

  return { files, ignore };
}

export {
  findUserESLintConfig,
  collectMarkdown,
  commandExists,
  resolveMatrixConfig,
  buildPatterns,
};
