import process from 'node:process';
import matrixaiConfigBundle from '../configs/matrixai-config-bundle.js';
import { FlatESLint } from '@typescript-eslint/utils/ts-eslint';

// Dynamically import the shared config
const sharedConfig = matrixaiConfigBundle;

export async function runESLint({ fix }) {
  const eslint = new FlatESLint({
    overrideConfig: matrixaiConfigBundle,
    fix,
  });

  const results = await eslint.lintFiles([
    'src/**/*.{js,ts,jsx,tsx}',
    'scripts/**/*.{js,ts}',
    'tests/**/*.{js,ts}',
    'pages/**/*.{js,ts,jsx,tsx}',
    'docs/**/*.{js,ts,jsx,tsx}',
    'server/**/*.{js,ts,jsx,tsx}',
  ]);

  if (fix) {
    await FlatESLint.outputFixes(results);
  }

  const formatter = await eslint.loadFormatter('stylish');
  const resultText = formatter.format(results);
  console.log(resultText);

  const hasErrors = results.some(r => r.errorCount > 0);
  if (hasErrors) {
    process.exit(1);
  }
}

