import type { MatrixAILintCfgResolved } from './types.js';
import type Logger from '@matrixai/logger';
import path from 'node:path';
import process from 'node:process';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import url from 'node:url';
import ts from 'typescript';
import { ESLint } from 'eslint';
import { LogLevel } from '@matrixai/logger';
import { resolveLintConfig } from './config.js';

/**
 * Convert verbosity count to logger level.
 */
function verboseToLogLevel(c: number = 0): LogLevel {
  let logLevel = LogLevel.INFO;
  if (c === 1) {
    logLevel = LogLevel.DEBUG;
  } else if (c >= 2) {
    logLevel = LogLevel.NOTSET;
  }
  return logLevel;
}

async function runESLint({
  fix,
  configPath,
  explicitGlobs,
  resolvedConfig,
  logger,
}: {
  fix: boolean;
  configPath?: string;
  explicitGlobs?: string[];
  resolvedConfig?: MatrixAILintCfgResolved;
  logger: Logger;
}): Promise<boolean> {
  const dirname = path.dirname(url.fileURLToPath(import.meta.url));
  const defaultConfigPath = path.resolve(dirname, './configs/js.js');

  // PATH A – user supplied explicit globs
  if (explicitGlobs?.length) {
    logger.info('Linting with explicit patterns:');
    explicitGlobs.forEach((g) => logger.info('  ' + g));

    const eslint = new ESLint({
      overrideConfigFile: configPath || defaultConfigPath,
      fix,
      errorOnUnmatchedPattern: false,
      warnIgnored: false,
      ignorePatterns: [], // Trust caller entirely
    });

    return await lintAndReport(eslint, explicitGlobs, fix, logger);
  }

  // PATH B – default behaviour (tsconfig + matrix config)
  const lintConfig = resolvedConfig ?? resolveLintConfig();
  const { forceInclude, tsconfigPaths } = lintConfig.domains.eslint;

  if (tsconfigPaths.length === 0) {
    logger.error('[matrixai-lint]  ⚠  No tsconfig.json files found.');
    return true;
  }

  logger.info(`Found ${tsconfigPaths.length} tsconfig.json files:`);
  tsconfigPaths.forEach((p) => logger.info('  ' + p));

  const { files: patterns, ignore: ignorePats } = buildPatterns(
    tsconfigPaths[0],
    forceInclude,
  );

  logger.info('Linting files:');
  patterns.forEach((p) => logger.info('  ' + p));

  const eslint = new ESLint({
    overrideConfigFile: configPath || defaultConfigPath,
    fix,
    errorOnUnmatchedPattern: false,
    warnIgnored: false,
    ignorePatterns: ignorePats,
  });

  return await lintAndReport(eslint, patterns, fix, logger);
}

async function lintAndReport(
  eslint: ESLint,
  patterns: string[],
  fix: boolean,
  logger: Logger,
): Promise<boolean> {
  const results = await eslint.lintFiles(patterns);

  if (fix) {
    await ESLint.outputFixes(results);
  }

  const formatter = await eslint.loadFormatter('stylish');
  logger.info(formatter.format(results));
  const hasErrors = results.some((r) => r.errorCount > 0);

  return hasErrors;
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
  const files = fs.readdirSync(dir, { encoding: 'utf8', recursive: true });

  return files
    .filter((f) => /\.(md|mdx)$/i.test(f))
    .map((f) => path.join(dir, f));
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
  verboseToLogLevel,
  runESLint,
  findUserESLintConfig,
  collectMarkdown,
  commandExists,
  buildPatterns,
};
