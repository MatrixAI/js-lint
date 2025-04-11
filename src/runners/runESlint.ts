import process from 'process';
import path from 'path';
import url from 'url';
import { ESLint } from 'eslint';
import configBundle from '../configs/matrixai-config-bundle.js';
import * as utils from '../utils/index.js';

// eslint-disable-next-line @typescript-eslint/naming-convention
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

interface RunESLintOptions {
  fix: boolean;
  configPath?: string; // Optional path to config file
}

export async function runESLint({ fix, configPath }: RunESLintOptions) {
  const tsconfigFiles = utils.findTsconfigFiles();
  const tsconfigIncludes = utils.loadTsconfigIncludes(tsconfigFiles[0]);

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
