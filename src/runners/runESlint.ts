import process from 'process';
import path from 'path';
import url from 'url';
import { ESLint } from 'eslint';
import { resolveMatrixConfig, buildPatterns } from '../utils/utils.js';

// eslint-disable-next-line @typescript-eslint/naming-convention
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const defaultConfigPath = path.resolve(__dirname, '../configs/js.js');
interface RunESLintOptions {
  fix: boolean;
  configPath?: string; // Optional path to config file
}

/* eslint-disable no-console */
export async function runESLint({ fix, configPath }: RunESLintOptions) {
  const { tsconfigPaths, forceInclude } = resolveMatrixConfig();

  if (tsconfigPaths.length === 0) {
    console.error('[matrixai-lint]  ⚠  No tsconfig.json files found.');
    process.exit(1);
  }

  console.log(`Found ${tsconfigPaths.length} tsconfig.json files:`);
  tsconfigPaths.forEach((tsconfigPath) => console.log('  ' + tsconfigPath));

  const { files: lintFiles, ignore } = buildPatterns(
    tsconfigPaths[0],
    forceInclude,
  );

  console.log('Linting files:');
  lintFiles.forEach((file) => console.log('  ' + file));
  console.log('Ignoring files:');
  ignore.forEach((file) => console.log('  ' + file));

  // Resolve absolute path to config

  const eslint = new ESLint({
    overrideConfigFile: configPath || defaultConfigPath,
    fix,
    errorOnUnmatchedPattern: false,
    warnIgnored: false,
    ignorePatterns: ignore,
  });

  const results = await eslint.lintFiles(lintFiles);

  if (fix) {
    await ESLint.outputFixes(results);
  }

  const formatter = await eslint.loadFormatter('stylish');
  const resultText = formatter.format(results);
  console.log(resultText);

  const hasErrors = results.some((r) => r.errorCount > 0);
  if (hasErrors) {
    process.exit(1);
  }

  /* eslint-enable no-console */
}
