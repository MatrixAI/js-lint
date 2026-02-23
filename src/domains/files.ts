import path from 'node:path';
import process from 'node:process';
import fs from 'node:fs';
import { minimatch } from 'minimatch';

const GLOB_META_PATTERN = /[*?[\]{}()!+@]/;

const EXCLUDED_DIR_NAMES = new Set(['.git', 'node_modules', 'dist']);

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
): string[] {
  const extensionSet = new Set(extensions.map((ext) => ext.toLowerCase()));
  const matchedFiles = new Set<string>();

  const visitPath = (entryPath: string): void => {
    let entryStats: fs.Stats;
    try {
      entryStats = fs.statSync(entryPath);
    } catch {
      return;
    }

    if (entryStats.isFile()) {
      const extension = path.extname(entryPath).toLowerCase();
      if (extensionSet.has(extension)) {
        matchedFiles.add(entryPath);
      }
      return;
    }

    if (!entryStats.isDirectory()) {
      return;
    }

    let dirEntries: fs.Dirent[];
    try {
      dirEntries = fs.readdirSync(entryPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const dirEntry of dirEntries) {
      const childPath = path.join(entryPath, dirEntry.name);
      if (dirEntry.isDirectory()) {
        if (EXCLUDED_DIR_NAMES.has(dirEntry.name)) {
          continue;
        }
        visitPath(childPath);
      } else if (dirEntry.isFile()) {
        visitPath(childPath);
      }
    }
  };

  for (const searchRoot of searchRoots) {
    visitPath(searchRoot);
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
    const files = collectFilesByExtensions([literalDirectory], extensions);
    files.forEach((file) => matchedFiles.add(file));
  }

  if (globPatterns.length > 0) {
    const globRoots = resolveSearchRootsFromPatterns(globPatterns, cwd);
    const globCandidates = collectFilesByExtensions(globRoots, extensions);
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
  resolveSearchRootsFromPatterns,
  collectFilesByExtensions,
  resolveFilesFromPatterns,
  relativizeFiles,
};
