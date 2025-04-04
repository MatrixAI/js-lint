import process from 'node:process';
import path from 'node:path';
import url from 'node:url';
import matrixaiConfigBundle from '../configs/matrixai-config-bundle.js';
import { ESLint } from 'eslint';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

export async function runESLint({ fix, patterns }) {
  // Resolve absolute path to config
  const configPath = path.resolve(
    __dirname,
    '../configs/matrixai-config-bundle.js',
  );

  const eslint = new ESLint({
    overrideConfigFile: configPath,
    fix,
    errorOnUnmatchedPattern: false,
    
  });

  console.log ("config bundle: " + matrixaiConfigBundle.toString());
  console.log("config:" + eslint.findConfigFile());

  const results = await eslint.lintFiles(patterns ||[
    'src/**/*.{js,ts,jsx,tsx}',
    'scripts/**/*.{js,ts}',
    'tests/**/*.{js,ts}',
    'pages/**/*.{js,ts,jsx,tsx}',
    'docs/**/*.{js,ts,jsx,tsx}',
    'server/**/*.{js,ts,jsx,tsx}',
  ]);



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
}
