import path from 'node:path';
import process from 'node:process';
import childProcess from 'node:child_process';
import fs from 'fs';
import glob from 'fast-glob';

function findTsconfigFiles(repoRoot = process.cwd()) {
  return glob.sync('tsconfig.json', {
    cwd: repoRoot,
    absolute: true,
    deep: 1, // Only look at top-level (or you can use deep: true for nested)
  });
}

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

// A helper to parse a tsconfig, returning its `include` array (and/or `files`)
function loadTsconfigIncludes(tsconfigPath: string): string[] {
  const tsconfigText = fs.readFileSync(tsconfigPath, 'utf-8');
  const tsconfig = JSON.parse(tsconfigText);
  return [...(tsconfig.include ?? [])];
}

/** Recursively collect *.md / *.mdx files under a directory */
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

function commandExists(cmd: string): boolean {
  const whichCmd = process.platform === 'win32' ? 'where' : 'which';
  const result = childProcess.spawnSync(whichCmd, [cmd], { stdio: 'ignore' });
  return result.status === 0;
}

export {
  findTsconfigFiles,
  findUserESLintConfig,
  loadTsconfigIncludes,
  collectMarkdown,
  commandExists,
};
