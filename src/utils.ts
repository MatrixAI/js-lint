import type { MatrixAILintCfg, RawMatrixCfg } from './types.js';
import path from 'node:path';
import process from 'node:process';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import url from 'node:url';
import ts from 'typescript';
import { ESLint } from 'eslint';

/* eslint-disable no-console */
async function runESLint({
  fix,
  configPath,
  explicitGlobs,
}: {
  fix: boolean;
  configPath?: string;
  explicitGlobs?: string[];
}): Promise<boolean> {
  const dirname = path.dirname(url.fileURLToPath(import.meta.url));
  const defaultConfigPath = path.resolve(dirname, './configs/js.js');

  // PATH A – user supplied explicit globs
  if (explicitGlobs?.length) {
    console.log('Linting with explicit patterns:');
    explicitGlobs.forEach((g) => console.log('  ' + g));

    const eslint = new ESLint({
      overrideConfigFile: configPath || defaultConfigPath,
      fix,
      errorOnUnmatchedPattern: false,
      warnIgnored: false,
      ignorePatterns: [], // Trust caller entirely
    });

    return await lintAndReport(eslint, explicitGlobs, fix);
  }

  // PATH B – default behaviour (tsconfig + matrix config)
  const { forceInclude, tsconfigPaths } = resolveMatrixConfig();

  if (tsconfigPaths.length === 0) {
    console.error('[matrixai-lint]  ⚠  No tsconfig.json files found.');
  }

  console.log(`Found ${tsconfigPaths.length} tsconfig.json files:`);
  tsconfigPaths.forEach((p) => console.log('  ' + p));

  const { files: patterns, ignore: ignorePats } = buildPatterns(
    tsconfigPaths[0],
    forceInclude,
  );

  console.log('Linting files:');
  patterns.forEach((p) => console.log('  ' + p));

  const eslint = new ESLint({
    overrideConfigFile: configPath || defaultConfigPath,
    fix,
    errorOnUnmatchedPattern: false,
    warnIgnored: false,
    ignorePatterns: ignorePats,
  });

  return await lintAndReport(eslint, patterns, fix);
}

async function lintAndReport(
  eslint: ESLint,
  patterns: string[],
  fix: boolean,
): Promise<boolean> {
  const results = await eslint.lintFiles(patterns);

  if (fix) {
    await ESLint.outputFixes(results);
  }

  const formatter = await eslint.loadFormatter('stylish');
  console.log(formatter.format(results));
  const hasErrors = results.some((r) => r.errorCount > 0);

  return hasErrors;
}
/* eslint-enable no-console */

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

// Checks if the value is an object and not null
// and then casts it to RawMatrixCfg. If the value is not an object or is null,
// it returns undefined.
function asRawMatrixCfg(v: unknown): RawMatrixCfg | undefined {
  return typeof v === 'object' && v !== null ? (v as RawMatrixCfg) : undefined;
}

/**
 * Loads and sanitises MatrixAI‑linter config for a repo.
 *
 * - Reads `matrixai-lint-config.json` in `repoRoot` (if present).
 *   - Throws if the JSON is invalid.
 * - Extracts `tsconfigPaths` & `forceInclude`, coercing each to `string[]`.
 * - Resolves `tsconfigPaths` to absolute paths and keeps only files that exist.
 *   - If none remain, falls back to `repoRoot/tsconfig.json` when available.
 * - Strips leading “./” from every `forceInclude` glob.
 *
 * Returns a normalised `{ tsconfigPaths, forceInclude }`.
 */
function resolveMatrixConfig(repoRoot = process.cwd()): MatrixAILintCfg {
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

/**
 * Builds file and ignore patterns based on a given TypeScript configuration file path,
 * with optional forced inclusion of specific paths.
 *
 * @param tsconfigPath - The path to the TypeScript configuration file (tsconfig.json).
 * @param forceInclude - An optional array of paths or patterns to forcefully include,
 *                       even if they overlap with excluded patterns.
 * @returns An object containing:
 *          - `files`: An array of glob patterns for files to include.
 *          - `ignore`: An array of glob patterns for files or directories to ignore.
 *
 * The function reads the `include` and `exclude` properties from the TypeScript
 * configuration file, processes them into glob patterns, and applies overrides
 * based on the `forceInclude` parameter. If no `exclude` patterns are specified,
 * default ignore patterns for common directories like `node_modules` are added.
 */
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

  if (exclude.length <= 0) {
    ignore.push('node_modules/**', 'bower_components/**', 'jspm_packages/**');
  }

  return { files, ignore };
}

export {
  runESLint,
  findUserESLintConfig,
  collectMarkdown,
  commandExists,
  resolveMatrixConfig,
  buildPatterns,
};
