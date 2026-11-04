import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadESLintSettings } from '#eslint/settings.js';
import {
  resolveProjectTailwind,
  validateTailwindEntrypoint,
} from '#eslint/projectTailwind.js';

describe('consumer ESLint settings and Tailwind resolution', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'matrixai-eslint-settings-'));
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  function settings(value: unknown) {
    fs.writeFileSync(
      path.join(root, 'eslint.settings.json'),
      JSON.stringify(value),
    );
  }

  function tailwind(version: string) {
    const dependency = path.join(root, 'node_modules/tailwindcss');
    fs.mkdirSync(dependency, { recursive: true });
    fs.writeFileSync(
      path.join(dependency, 'package.json'),
      JSON.stringify({ name: 'tailwindcss', version }),
    );
  }

  test('does not require Tailwind or CSS settings for ordinary consumers', () => {
    expect(loadESLintSettings(root)).toStrictEqual({});
  });

  test('anchors native settings to their owning root, not process CWD', () => {
    settings({
      tailwindcss: {
        cssConfigPath: 'src/ui/styles/tailwind.css',
        functions: ['clsx'],
      },
      react: { version: '19.0' },
    });
    const cwd = process.cwd();
    expect(loadESLintSettings(root)).toStrictEqual({
      tailwindcss: {
        cssConfigPath: path.join(root, 'src/ui/styles/tailwind.css'),
        functions: ['clsx'],
      },
      react: { version: '19.0' },
    });
    expect(process.cwd()).toBe(cwd);
  });

  test.each([
    [],
    null,
    { tailwindcss: [] },
    { tailwindcss: { cssConfigPath: '' } },
  ])('rejects invalid settings: %j', (value) => {
    settings(value);
    expect(() => loadESLintSettings(root)).toThrow(
      'Invalid native ESLint settings',
    );
  });

  test('reports missing consumer dependency instead of using the tool peer', () => {
    expect(() => resolveProjectTailwind(root)).toThrow(
      "requires the consumer's tailwindcss dependency",
    );
  });

  test('preserves the documented v4-only contract', () => {
    tailwind('3.4.19');
    expect(() => resolveProjectTailwind(root)).toThrow(
      'Unsupported consumer Tailwind CSS 3.4.19',
    );
  });

  test('reports an invalid CSS entrypoint with the settings boundary', () => {
    expect(() =>
      validateTailwindEntrypoint(root, path.join(root, 'absent.css')),
    ).toThrow('settings.tailwindcss.cssConfigPath');
    expect(() => validateTailwindEntrypoint(root, root)).toThrow(
      'Invalid Tailwind CSS entrypoint',
    );
  });

  test('rejects different project and stylesheet Tailwind installations', () => {
    tailwind('4.3.4');
    const nested = path.join(root, 'packages/site');
    fs.mkdirSync(path.join(nested, 'node_modules/tailwindcss'), {
      recursive: true,
    });
    fs.writeFileSync(path.join(nested, 'entry.css'), '');
    fs.writeFileSync(
      path.join(nested, 'node_modules/tailwindcss/package.json'),
      '{"name":"tailwindcss","version":"4.3.3"}',
    );
    expect(() =>
      validateTailwindEntrypoint(root, path.join(nested, 'entry.css')),
    ).toThrow('Tailwind dependency mismatch');
  });
});
