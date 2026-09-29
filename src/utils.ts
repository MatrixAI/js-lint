import type { Ignore, Options as IgnoreOptions } from 'ignore';
import path from 'node:path';
import process from 'node:process';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { minimatch } from 'minimatch';
import { LogLevel } from '@matrixai/logger';

const require = createRequire(import.meta.url);
const createIgnore = require('ignore') as (options?: IgnoreOptions) => Ignore;

const GLOB_META_PATTERN = /[*?[\]{}()!+@]/;

const EXCLUDED_DIR_NAMES = new Set(['.git', 'node_modules', 'dist']);

const DEFAULT_TAILWIND_CSS_FILES = [
  './src/**/*.css',
  './pages/**/*.css',
  './docs/**/*.css',
  './blog/**/*.css',
  './styles/**/*.css',
  '!**/node_modules/**',
  '!**/.*/**',
  '!**/dist/**',
  '!**/build/**',
  '!**/tmp/**',
] as const;

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

function normalizePathForGlob(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '');
}

function normalizePatternForSearchRoot(pattern: string): string {
  return pattern.trim().replace(/\\/g, '/');
}

function toPosixRelativePath(filePath: string, cwd = process.cwd()): string {
  const relativePath = path.relative(cwd, filePath).split(path.sep).join('/');
  if (relativePath === '') {
    return '.';
  }
  return relativePath;
}

function isPathInside(childPath: string, parentPath: string): boolean {
  const relativePath = path.relative(parentPath, childPath);
  return (
    relativePath === '' ||
    (relativePath.length > 0 &&
      !relativePath.startsWith('..') &&
      !path.isAbsolute(relativePath))
  );
}

function createGitignoreMatcher(cwd = process.cwd()): Ignore {
  const matcher = createIgnore({ allowRelativePaths: true });
  const gitignorePath = path.join(cwd, '.gitignore');

  try {
    matcher.add(fs.readFileSync(gitignorePath, 'utf8'));
  } catch {
    // A project does not have to use Git. In that case the built-in generated
    // directory guards and symlink boundary checks still protect traversal.
  }

  return matcher;
}

function isIgnoredPath(
  filePath: string,
  matcher: Ignore,
  cwd = process.cwd(),
  isDirectory = false,
): boolean {
  const relativePath = toPosixRelativePath(filePath, cwd);

  if (relativePath === '.' || relativePath.startsWith('../')) {
    return false;
  }

  return (
    matcher.ignores(relativePath) ||
    (isDirectory && matcher.ignores(`${relativePath}/`))
  );
}

function normalizePatternForMatching(
  pattern: string,
  cwd = process.cwd(),
): string {
  const normalizedPattern = normalizePathForGlob(pattern.trim());
  if (normalizedPattern.length === 0) {
    return '';
  }

  const platformPattern = normalizedPattern.split('/').join(path.sep);
  const absolutePattern = path.isAbsolute(platformPattern)
    ? platformPattern
    : path.resolve(cwd, platformPattern);

  return toPosixRelativePath(absolutePattern, cwd);
}

function isGlobPattern(value: string): boolean {
  return GLOB_META_PATTERN.test(value);
}

function patternToSearchRoot(pattern: string, cwd = process.cwd()): string {
  const normalizedPattern = normalizePatternForSearchRoot(pattern);

  if (!isGlobPattern(normalizedPattern)) {
    return path.resolve(cwd, normalizedPattern);
  }

  const platformPattern = normalizedPattern.split('/').join(path.sep);
  const segments = platformPattern
    .split(path.sep)
    .filter((segment) => segment.length > 0);
  const rootSegments: string[] = [];

  for (const segment of segments) {
    if (isGlobPattern(segment)) {
      break;
    }
    rootSegments.push(segment);
  }

  if (rootSegments.length === 0) {
    return cwd;
  }

  return path.resolve(cwd, ...rootSegments);
}

function resolveSearchRootsFromPatterns(
  patterns: readonly string[],
  cwd = process.cwd(),
): string[] {
  const existingRoots = new Set<string>();

  for (const pattern of patterns) {
    const root = patternToSearchRoot(pattern, cwd);
    if (fs.existsSync(root)) {
      existingRoots.add(root);
    }
  }

  return [...existingRoots].sort();
}

function collectFilesByExtensions(
  searchRoots: readonly string[],
  extensions: readonly string[],
  cwd = process.cwd(),
): string[] {
  const extensionSet = new Set(extensions.map((ext) => ext.toLowerCase()));
  const matchedFiles = new Set<string>();
  const ignoreMatcher = createGitignoreMatcher(cwd);

  let projectRootRealPath: string;
  try {
    projectRootRealPath = fs.realpathSync.native(cwd);
  } catch {
    projectRootRealPath = path.resolve(cwd);
  }

  const visitPath = (
    entryPath: string,
    rootRealPath: string,
    visitedDirectoryRealPaths: Set<string>,
    isSearchRoot = false,
  ): void => {
    let entryStats: fs.Stats;
    try {
      entryStats = fs.statSync(entryPath);
    } catch {
      return;
    }

    const isDirectory = entryStats.isDirectory();

    if (
      !isSearchRoot &&
      isIgnoredPath(entryPath, ignoreMatcher, cwd, isDirectory)
    ) {
      return;
    }

    if (entryStats.isFile()) {
      const extension = path.extname(entryPath).toLowerCase();
      if (extensionSet.has(extension)) {
        matchedFiles.add(entryPath);
      }
      return;
    }

    if (!isDirectory) {
      return;
    }

    let realPath: string;
    try {
      realPath = fs.realpathSync.native(entryPath);
    } catch {
      return;
    }

    if (visitedDirectoryRealPaths.has(realPath)) {
      return;
    }
    visitedDirectoryRealPaths.add(realPath);

    let dirEntries: fs.Dirent[];
    try {
      dirEntries = fs.readdirSync(entryPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const dirEntry of dirEntries) {
      const childPath = path.join(entryPath, dirEntry.name);
      if (dirEntry.isDirectory() || dirEntry.isSymbolicLink()) {
        if (EXCLUDED_DIR_NAMES.has(dirEntry.name)) {
          continue;
        }

        if (dirEntry.isSymbolicLink()) {
          let childRealPath: string;
          try {
            childRealPath = fs.realpathSync.native(childPath);
          } catch {
            continue;
          }

          // Recursive discovery must not escape the package root through
          // repository-to-repository scratch symlinks such as tmp/project-a ->
          // project-a. An explicitly targeted external search root is still
          // allowed because it receives its own rootRealPath below.
          if (!isPathInside(childRealPath, projectRootRealPath)) {
            continue;
          }

          // A symlink can stay inside the package root but still jump outside
          // the current logical search root. Keeping both boundaries avoids
          // surprising cross-root scans while preserving explicit opt-in roots.
          if (!isPathInside(childRealPath, rootRealPath)) {
            continue;
          }
        }

        visitPath(childPath, rootRealPath, visitedDirectoryRealPaths);
      } else if (dirEntry.isFile()) {
        visitPath(childPath, rootRealPath, visitedDirectoryRealPaths);
      }
    }
  };

  for (const searchRoot of searchRoots) {
    let rootRealPath: string;
    try {
      rootRealPath = fs.realpathSync.native(searchRoot);
    } catch {
      continue;
    }

    visitPath(searchRoot, rootRealPath, new Set<string>(), true);
  }

  return [...matchedFiles].sort();
}

function resolveFilesFromPatterns(
  patterns: readonly string[],
  extensions: readonly string[],
  cwd = process.cwd(),
): string[] {
  const normalizedPatterns = [...new Set(patterns)]
    .map((pattern) => pattern.trim())
    .filter((pattern) => pattern.length > 0);

  if (normalizedPatterns.length === 0) {
    return [];
  }

  const extensionSet = new Set(
    extensions.map((extension) => extension.toLowerCase()),
  );
  const matchedFiles = new Set<string>();
  const literalFiles = new Set<string>();
  const literalDirectories = new Set<string>();
  const globPatterns: string[] = [];

  for (const pattern of normalizedPatterns) {
    const platformPattern = pattern.replace(/\//g, path.sep);
    const absolutePath = path.isAbsolute(platformPattern)
      ? platformPattern
      : path.resolve(cwd, platformPattern);
    let stats: fs.Stats | undefined;

    try {
      stats = fs.statSync(absolutePath);
    } catch {
      stats = undefined;
    }

    if (stats?.isFile()) {
      literalFiles.add(absolutePath);
      continue;
    }

    if (stats?.isDirectory()) {
      literalDirectories.add(absolutePath);
      continue;
    }

    if (isGlobPattern(pattern)) {
      globPatterns.push(pattern);
      continue;
    }
  }

  for (const literalFile of literalFiles) {
    const extension = path.extname(literalFile).toLowerCase();
    if (extensionSet.has(extension)) {
      matchedFiles.add(literalFile);
    }
  }

  for (const literalDirectory of literalDirectories) {
    const files = collectFilesByExtensions([literalDirectory], extensions, cwd);
    files.forEach((file) => matchedFiles.add(file));
  }

  if (globPatterns.length > 0) {
    const globRoots = resolveSearchRootsFromPatterns(globPatterns, cwd);
    const globCandidates = collectFilesByExtensions(globRoots, extensions, cwd);
    const normalizedGlobPatterns = globPatterns
      .map((pattern) => normalizePatternForMatching(pattern, cwd))
      .filter((pattern) => pattern.length > 0);

    for (const candidate of globCandidates) {
      const relativeCandidatePath = toPosixRelativePath(candidate, cwd);
      if (
        normalizedGlobPatterns.some((pattern) =>
          minimatch(relativeCandidatePath, pattern, {
            dot: true,
          }),
        )
      ) {
        matchedFiles.add(candidate);
      }
    }
  }

  return relativizeFiles([...matchedFiles].sort(), cwd);
}

function relativizeFiles(
  files: readonly string[],
  cwd = process.cwd(),
): string[] {
  return files.map((file) => {
    const relativePath = path.relative(cwd, file);
    if (relativePath === '') {
      return '.';
    }
    return relativePath;
  });
}

export {
  collectFilesByExtensions,
  commandExists,
  DEFAULT_TAILWIND_CSS_FILES,
  relativizeFiles,
  resolveFilesFromPatterns,
  resolveSearchRootsFromPatterns,
  verboseToLogLevel,
};
