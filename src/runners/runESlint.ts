import process from 'process';
import path from 'path';
import url from 'url';
import fs from 'fs';
import { ESLint } from 'eslint';
import glob from 'fast-glob';

// eslint-disable-next-line @typescript-eslint/naming-convention
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

interface RunESLintOptions {
  fix: boolean;
  patterns?: string[]; // Optional array of strings
  configPath?: string; // Optional path to config file
}



// A helper to parse a tsconfig, returning its `include` array (and/or `files`)
function loadTsconfigIncludes(tsconfigPath: string): string[] {
  const tsconfigText = fs.readFileSync(tsconfigPath, 'utf-8');
  const tsconfig = JSON.parse(tsconfigText);
  return [...(tsconfig.include ?? [])];
}

function findTsconfigFiles(repoRoot = process.cwd()) {
  return glob.sync('tsconfig.json', {
    cwd: repoRoot,
    absolute: true,
    deep: 1, // Only look at top-level (or you can use deep: true for nested)
  });
}

export async function runESLint({ fix, configPath }: RunESLintOptions) {
  const tsconfigFiles = findTsconfigFiles();
  const tsconfigIncludes = loadTsconfigIncludes(tsconfigFiles[0]);

  const expandedIncludes = tsconfigIncludes.map(
    (element) => `${element}.{js,mjs,ts,mts,jsx,tsx,json}`,
  );

  // Resolve absolute path to config
  const defaultConfigPath = path.resolve(
    __dirname,
    '../configs/matrixai-config-bundle.js',
  );

  const eslint = new ESLint({
    overrideConfigFile: configPath || defaultConfigPath,
    fix,
    errorOnUnmatchedPattern: false,
    warnIgnored: false,
  });

  const results = await eslint.lintFiles(expandedIncludes);

  if (fix) {
    await ESLint.outputFixes(results);
  }

  const formatter = await eslint.loadFormatter('stylish');
  const resultText = formatter.format(results);
  // eslint-disable-next-line no-console
  console.log(resultText);

  const hasErrors = results.some((r) => r.errorCount > 0);
  if (hasErrors) {
    process.exit(1);
  }
}
