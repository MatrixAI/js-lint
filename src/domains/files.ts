import path from 'node:path';
import process from 'node:process';
import fs from 'node:fs';

const GLOB_META_PATTERN = /[*?[\]{}()!+@]/;

const EXCLUDED_DIR_NAMES = new Set(['.git', 'node_modules', 'dist']);

function isGlobPattern(value: string): boolean {
  return GLOB_META_PATTERN.test(value);
}

function patternToSearchRoot(pattern: string, cwd = process.cwd()): string {
  if (!isGlobPattern(pattern)) {
    return path.resolve(cwd, pattern);
  }

  const normalizedPattern = pattern.split('/').join(path.sep);
  const segments = normalizedPattern
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
  relativizeFiles,
};
