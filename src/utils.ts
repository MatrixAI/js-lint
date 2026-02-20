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

const ESLINT_TARGET_EXTENSIONS = [
  'js',
  'mjs',
  'cjs',
  'jsx',
  'ts',
  'tsx',
  'mts',
  'cts',
  'json',
] as const;

const ESLINT_TARGET_EXTENSION_GLOB = `.{${ESLINT_TARGET_EXTENSIONS.join(',')}}`;

const DEFAULT_IGNORE_PATTERNS = [
  'node_modules/**',
  'bower_components/**',
  'jspm_packages/**',
] as const;

const GLOB_META_PATTERN = /[*?[\]{}()!+@]/;

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
  const lintConfig = resolvedConfig ?? resolveLintConfig();
  const parserProjectOverride = {
    languageOptions: {
      parserOptions: {
        project: lintConfig.domains.eslint.tsconfigPaths,
      },
    },
  };

  // PATH A - user supplied explicit globs
  if (explicitGlobs?.length) {
    logger.info('Linting with explicit patterns:');
    explicitGlobs.forEach((g) => logger.info('  ' + g));

    const eslint = new ESLint({
      overrideConfigFile: configPath || defaultConfigPath,
      fix,
      errorOnUnmatchedPattern: false,
      warnIgnored: false,
      ignorePatterns: [], // Trust caller entirely
      overrideConfig: parserProjectOverride,
    });

    return await lintAndReport(eslint, explicitGlobs, fix, logger);
  }

  // PATH B - default behaviour (tsconfig + matrix config)
  const { forceInclude, tsconfigPaths } = lintConfig.domains.eslint;

  if (tsconfigPaths.length === 0) {
    logger.error('[matrixai-lint]  ⚠  No tsconfig.json files found.');
    return true;
  }

  logger.info(`Found ${tsconfigPaths.length} tsconfig.json files:`);
  tsconfigPaths.forEach((p) => logger.info('  ' + p));

  const { files: patterns, ignore: ignorePats } = buildPatterns(
    tsconfigPaths,
    forceInclude,
    process.cwd(),
    lintConfig.root,
  );

  if (patterns.length === 0) {
    logger.warn(
      '[matrixai-lint]  ⚠  No ESLint targets were derived from configured tsconfig paths.',
    );
    return false;
  }

  logger.info('Linting files:');
  patterns.forEach((p) => logger.info('  ' + p));

  const eslint = new ESLint({
    overrideConfigFile: configPath || defaultConfigPath,
    fix,
    errorOnUnmatchedPattern: false,
    warnIgnored: false,
    ignorePatterns: ignorePats,
    overrideConfig: parserProjectOverride,
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

function toStringArray(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }

  return [];
}

function dedupeAndSort(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function normalizeGlobValue(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/^\.\//, '');
}

function rebasePatternToCwd({
  pattern,
  baseDir,
  cwd,
}: {
  pattern: string;
  baseDir: string;
  cwd: string;
}): string {
  const normalizedPattern = normalizeGlobValue(pattern);
  if (normalizedPattern.length === 0) {
    return '';
  }

  const platformPattern = normalizedPattern.split('/').join(path.sep);
  const absolutePattern = path.isAbsolute(platformPattern)
    ? platformPattern
    : path.resolve(baseDir, platformPattern);
  const relativePattern = path
    .relative(cwd, absolutePattern)
    .split(path.sep)
    .join('/');

  if (relativePattern.length === 0) {
    return '.';
  }

  return normalizeGlobValue(relativePattern);
}

function hasExtensionOrGlobExtensionPattern(value: string): boolean {
  return /(^|\/)[^/]*\.[^/]*$/.test(value);
}

function expandExtensionlessPattern(value: string): string {
  const normalized = normalizeGlobValue(value).replace(/\/+$/, '');

  if (normalized.length === 0) {
    return '';
  }

  if (hasExtensionOrGlobExtensionPattern(normalized)) {
    return normalized;
  }

  if (!GLOB_META_PATTERN.test(normalized)) {
    return `${normalized}/**/*${ESLINT_TARGET_EXTENSION_GLOB}`;
  }

  if (normalized === '**') {
    return `**/*${ESLINT_TARGET_EXTENSION_GLOB}`;
  }

  if (normalized.endsWith('/**')) {
    return `${normalized}/*${ESLINT_TARGET_EXTENSION_GLOB}`;
  }

  return `${normalized}${ESLINT_TARGET_EXTENSION_GLOB}`;
}

function normalizeIncludePatterns(values: readonly string[]): string[] {
  return dedupeAndSort(
    values
      .map((value) => expandExtensionlessPattern(value))
      .filter((value) => value.length > 0),
  );
}

function normalizeExcludePatterns(values: readonly string[]): string[] {
  return dedupeAndSort(
    values
      .map((value) => normalizeGlobValue(value).replace(/\/+$/, ''))
      .filter((value) => value.length > 0),
  );
}

function patternPrefix(value: string): string {
  const normalized = normalizeGlobValue(value);
  const segments = normalized
    .split('/')
    .filter((segment) => segment.length > 0);
  const prefixSegments: string[] = [];

  for (const segment of segments) {
    if (GLOB_META_PATTERN.test(segment)) {
      break;
    }
    prefixSegments.push(segment);
  }

  return prefixSegments.join('/');
}

function patternsOverlapByPrefix(left: string, right: string): boolean {
  if (left === right) {
    return true;
  }

  const leftPrefix = patternPrefix(left);
  const rightPrefix = patternPrefix(right);

  if (leftPrefix.length === 0 || rightPrefix.length === 0) {
    return false;
  }

  return (
    leftPrefix === rightPrefix ||
    leftPrefix.startsWith(`${rightPrefix}/`) ||
    rightPrefix.startsWith(`${leftPrefix}/`)
  );
}

/**
 * Builds file and ignore patterns based on a given TypeScript configuration file path,
 * with optional forced inclusion of specific paths.
 *
 * @param tsconfigPaths - One or more paths to TypeScript configuration files.
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
  tsconfigPaths: readonly string[],
  forceInclude: string[] = [],
  cwd = process.cwd(),
  forceIncludeBaseDir = cwd,
): {
  files: string[];
  ignore: string[];
} {
  const normalizedForceInclude = normalizeIncludePatterns(
    forceInclude.map((value) =>
      rebasePatternToCwd({ pattern: value, baseDir: forceIncludeBaseDir, cwd }),
    ),
  );
  const forceIncludeRaw = dedupeAndSort(
    forceInclude
      .map((value) =>
        rebasePatternToCwd({
          pattern: value,
          baseDir: forceIncludeBaseDir,
          cwd,
        }),
      )
      .map((value) => normalizeGlobValue(value).replace(/\/+$/, ''))
      .filter((value) => value.length > 0),
  );

  const includePatternsByTsconfig: string[][] = [];
  const excludePatternsByTsconfig: string[][] = [];

  for (const tsconfigPath of tsconfigPaths) {
    if (!fs.existsSync(tsconfigPath)) {
      continue;
    }

    const tsconfigDir = path.dirname(tsconfigPath);

    const readResult = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    if (readResult.error != null || readResult.config == null) {
      continue;
    }

    const config = readResult.config as Record<string, unknown>;

    const rawInclude = toStringArray(config.include).map((pattern) =>
      rebasePatternToCwd({ pattern, baseDir: tsconfigDir, cwd }),
    );
    const defaultInclude = rebasePatternToCwd({
      pattern: '**/*',
      baseDir: tsconfigDir,
      cwd,
    });
    const normalizedInclude = normalizeIncludePatterns(
      rawInclude.length > 0 ? rawInclude : [defaultInclude],
    );
    const normalizedExclude = normalizeExcludePatterns(
      toStringArray(config.exclude).map((pattern) =>
        rebasePatternToCwd({ pattern, baseDir: tsconfigDir, cwd }),
      ),
    );

    includePatternsByTsconfig.push(normalizedInclude);
    excludePatternsByTsconfig.push(normalizedExclude);
  }

  const include = dedupeAndSort([
    ...includePatternsByTsconfig.flat(),
    ...normalizedForceInclude,
  ]);

  const ignoreCandidates: string[] = [];
  excludePatternsByTsconfig.forEach((excludePatterns, index) => {
    if (excludePatterns.length === 0) {
      ignoreCandidates.push(...DEFAULT_IGNORE_PATTERNS);
      return;
    }

    for (const excludePattern of excludePatterns) {
      const overlappedByOtherTsconfigInclude = includePatternsByTsconfig.some(
        (includePatterns, includeIndex) =>
          includeIndex !== index &&
          includePatterns.some((includePattern) =>
            patternsOverlapByPrefix(includePattern, excludePattern),
          ),
      );

      if (!overlappedByOtherTsconfigInclude) {
        ignoreCandidates.push(excludePattern);
      }
    }
  });

  const ignore = dedupeAndSort(ignoreCandidates).filter((ignorePattern) => {
    const overlappedByNormalized = normalizedForceInclude.some(
      (forceIncludePattern) =>
        patternsOverlapByPrefix(ignorePattern, forceIncludePattern),
    );
    const overlappedByRaw = forceIncludeRaw.some((forceIncludePattern) =>
      patternsOverlapByPrefix(ignorePattern, forceIncludePattern),
    );
    return !overlappedByNormalized && !overlappedByRaw;
  });

  return { files: include, ignore };
}

export {
  verboseToLogLevel,
  runESLint,
  findUserESLintConfig,
  collectMarkdown,
  commandExists,
  buildPatterns,
};
