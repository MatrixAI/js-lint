import type { ParseError } from 'jsonc-parser';
import path from 'node:path';
import process from 'node:process';
import fs from 'node:fs';
import { parse } from 'jsonc-parser';

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

/** Resolves ESLint configuration and project target patterns. */
class ESLintScope {
  public constructor(protected readonly root = process.cwd()) {}

  public findUserESLintConfig(repoRoot = this.root): string | undefined {
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

  public buildPatterns(
    tsconfigPaths: readonly string[],
    forceInclude: string[] = [],
    cwd = this.root,
    forceIncludeBaseDir = cwd,
  ): {
    files: string[];
    ignore: string[];
  } {
    const normalizedForceInclude = normalizeIncludePatterns(
      forceInclude.map((value) =>
        rebasePatternToCwd({
          pattern: value,
          baseDir: forceIncludeBaseDir,
          cwd,
        }),
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

      const errors: ParseError[] = [];
      const config = parse(fs.readFileSync(tsconfigPath, 'utf8'), errors, {
        allowTrailingComma: true,
      }) as Record<string, unknown> | null;
      if (errors.length > 0 || config == null) {
        continue;
      }

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
}

export default ESLintScope;
