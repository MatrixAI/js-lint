import path from 'node:path';
import process from 'node:process';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import ts from 'typescript';

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
function findUserESLintConfig(repoRoot = process.cwd()): string | undefined {
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
  return undefined;
}

/**
 * Collect all Markdown files in a directory and its subdirectories.
 *
 * @param dir The directory to search in.
 * @returns An array of paths to Markdown files.
 */
function collectMarkdown(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((e) => e.isFile() && /\.(md|mdx)$/i.test(e.name))
    .map((e) => path.join(dir, e.name));
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

type MatrixAILintConfig = {
  tsconfigPaths: string[];
  forceInclude: string[];
};

type RawMatrixCfg = Partial<{
  tsconfigPaths: unknown;
  forceInclude: unknown;
}>; // “might have these two keys, values are unknown”

// Checks if the value is an object and not null
// and then casts it to RawMatrixCfg. If the value is not an object or is null,
// it returns undefined.
function asRawMatrixCfg(v: unknown): RawMatrixCfg | undefined {
  return typeof v === 'object' && v !== null ? (v as RawMatrixCfg) : undefined;
}

function resolveMatrixConfig(repoRoot = process.cwd()): MatrixAILintConfig {
  const cfgPath = path.join(repoRoot, 'matrixai-lint-config.json');

  let rawCfg: unknown = {};

  if (fs.existsSync(cfgPath)) {
    try {
      const text = fs.readFileSync(cfgPath, 'utf8').trim();
      rawCfg = text.length > 0 ? JSON.parse(text) : {};
    } catch (e) {
      throw new Error(
        `[matrixai-lint]  ✖  matrixai-lint-config.json has been provided but it is not valid JSON.\n ${e}`,
      );
    }
  }

  const cfg = asRawMatrixCfg(rawCfg);

  const tsconfigPaths = toStringArray(cfg?.tsconfigPaths ?? [])
    .map((p) => path.resolve(repoRoot, p))
    .filter((p) => {
      if (fs.existsSync(p)) return true;
      console.warn(`[matrixai-lint]  ⚠  tsconfig not found: ${p}`);
      return false;
    });

  const forceInclude = toStringArray(cfg?.forceInclude ?? []).map((g) =>
    g.replace(/^\.\//, ''),
  );

  // Fallback to root tsconfig if no tsconfigPaths are provided
  // and the root tsconfig exists
  if (tsconfigPaths.length === 0) {
    const rootTs = path.join(repoRoot, 'tsconfig.json');
    if (fs.existsSync(rootTs)) tsconfigPaths.push(rootTs);
  }

  return { tsconfigPaths, forceInclude };
}

/**
 * Converts a value into an array of strings.
 *
 * - If the value is a string, it returns an array containing that string.
 * - If the value is an array, it filters the array to include only strings.
 * - For any other type, it returns an empty array.
 *
 * @param value The value to convert.
 * @returns An array of strings.
 */
function toStringArray(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return [];
}

function buildPatterns(
  tsconfigPath: string,
  forceInclude: string[] = [],
): {
  files: string[];
  ignore: string[];
} {
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
