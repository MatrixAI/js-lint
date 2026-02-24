import type { MatrixAILintCfgResolved } from '../types.js';
import type Logger from '@matrixai/logger';
import path from 'node:path';
import process from 'node:process';
import fs from 'node:fs';
import url from 'node:url';
import ts from 'typescript';
import { ESLint } from 'eslint';
import { resolveLintConfig } from '../config.js';

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
  const defaultConfigPath = path.resolve(dirname, '../configs/eslint.js');
  const resolvedConfigPath = configPath || defaultConfigPath;
  const lintConfig = resolvedConfig ?? resolveLintConfig();
  const parserProjectOverride = {
    languageOptions: {
      parserOptions: {
        project: lintConfig.domains.eslint.tsconfigPaths,
      },
    },
  };

  if (explicitGlobs?.length) {
    logger.info('Linting with explicit patterns:');
    explicitGlobs.forEach((pattern) => {
      logger.info(`Linting: ${pattern}`);
    });

    const eslint = new ESLint({
      overrideConfigFile: resolvedConfigPath,
      fix,
      errorOnUnmatchedPattern: false,
      warnIgnored: false,
      ignorePatterns: [],
      cache: true,
      cacheLocation: '.cache/matrixai-lint/eslint/.eslintcache',
      cacheStrategy: 'content',
      overrideConfig: parserProjectOverride,
    });

    return await lintAndReport(eslint, explicitGlobs, fix, logger);
  }

  const { forceInclude, tsconfigPaths } = lintConfig.domains.eslint;

  if (tsconfigPaths.length === 0) {
    logger.error('[matrixai-lint] ⚠ No tsconfig.json files found.');
    return true;
  }

  logger.info(`Found ${tsconfigPaths.length} tsconfig.json files:`);
  tsconfigPaths.forEach((tsconfigPath) => {
    logger.info(`Using tsconfig: ${tsconfigPath}`);
  });

  const { files: patterns, ignore: ignorePats } = buildPatterns(
    tsconfigPaths,
    forceInclude,
    process.cwd(),
    lintConfig.root,
  );

  if (patterns.length === 0) {
    logger.warn(
      '[matrixai-lint] ⚠ No ESLint targets were derived from configured tsconfig paths.',
    );
    return false;
  }

  logger.info('Linting files:');
  patterns.forEach((pattern) => {
    logger.info(`Linting: ${pattern}`);
  });

  const eslint = new ESLint({
    overrideConfigFile: resolvedConfigPath,
    fix,
    errorOnUnmatchedPattern: false,
    warnIgnored: false,
    ignorePatterns: ignorePats,
    cache: true,
    cacheLocation: '.cache/matrixai-lint/eslint/.eslintcache',
    cacheStrategy: 'content',
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

  const errorCount = results.reduce(
    (sum, result) => sum + result.errorCount,
    0,
  );
  const warningCount = results.reduce(
    (sum, result) => sum + result.warningCount,
    0,
  );
  logger.info(
    `ESLint summary: files=${results.length} errors=${errorCount} warnings=${warningCount} fix=${fix ? 'on' : 'off'}`,
  );

  const formatter = await eslint.loadFormatter('stylish');
  const formattedOutput = await formatter.format(results);
  for (const line of formattedOutput.split(/\r?\n/)) {
    const normalizedLine = line.trim();
    if (normalizedLine.length > 0) {
      logger.info(`ESLint detail: ${normalizedLine}`);
    }
  }

  const hasErrors = errorCount > 0;

  return hasErrors;
}

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

export { buildPatterns, findUserESLintConfig, runESLint };
