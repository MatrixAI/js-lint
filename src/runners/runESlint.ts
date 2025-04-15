import path from 'node:path';
import url from 'node:url';
import { ESLint } from 'eslint';
import { resolveMatrixConfig, buildPatterns } from '../utils/utils.js';

const dirname = path.dirname(url.fileURLToPath(import.meta.url));
const defaultConfigPath = path.resolve(dirname, '../configs/js.js');

/* eslint-disable no-console */
export async function runESLint({
  fix,
  configPath,
}: {
  fix: boolean;
  configPath?: string;
}) {
  const matrixaiLintConfig = resolveMatrixConfig();
  const forceInclude = matrixaiLintConfig.forceInclude;
  const tsconfigPaths = matrixaiLintConfig.tsconfigPaths;

  if (tsconfigPaths.length === 0) {
    console.error('[matrixai-lint]  ⚠  No tsconfig.json files found.');
  }

  console.log(`Found ${tsconfigPaths.length} tsconfig.json files:`);
  tsconfigPaths.forEach((tsconfigPath) => console.log('  ' + tsconfigPath));

  const { files: lintFiles, ignore } = buildPatterns(
    tsconfigPaths[0],
    forceInclude,
  );

  console.log('Linting files:');
  lintFiles.forEach((file) => console.log(' ' + file));

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

  /* eslint-enable no-console */
}
