import type { Linter } from 'eslint';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { ESLint } from 'eslint';
import tailwindcss from 'eslint-plugin-tailwindcss';
import { parseLintConfig } from '#config.js';
import { createEslintConfig } from '#configs/eslint.js';
import { clearNativeProjectService } from '#eslint/nativeTypeScriptAdapter.js';

describe('Tailwind v4 CSS-first integration', () => {
  let root: string;
  let cssConfigPath: string;

  beforeEach(async () => {
    root = await fs.promises.mkdtemp(path.join(tmpDir, 'matrixai-tailwind-'));
    cssConfigPath = path.join(root, 'styles', 'utilities.css');
    await fs.promises.mkdir(path.dirname(cssConfigPath), { recursive: true });
    await fs.promises.symlink(
      path.join(projectDir, 'node_modules'),
      path.join(root, 'node_modules'),
      'junction',
    );
    await fs.promises.writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({
        type: 'module',
        devDependencies: { tailwindcss: '^4.0.0' },
      }),
    );
    await fs.promises.writeFile(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          allowJs: true,
          jsx: 'preserve',
          noEmit: true,
          types: [],
        },
        include: ['**/*'],
      }),
    );
    await fs.promises.writeFile(
      cssConfigPath,
      '@import "tailwindcss";\n@theme { --color-brand: #123456; }\n',
    );
  });

  afterEach(async () => {
    clearNativeProjectService();
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  function preset(enabled = true) {
    return createEslintConfig(
      parseLintConfig({
        rawConfig: {
          version: 2,
          domains: { eslint: { tailwind: enabled ? 'enabled' : 'disabled' } },
        },
        repoRoot: root,
        configFilePath: path.join(root, 'matrixai-lint-config.json'),
      }),
    ) as Linter.Config[];
  }

  function engine({
    fix = false,
    enabled = true,
    overrides = [],
  }: {
    fix?: boolean;
    enabled?: boolean;
    overrides?: Linter.Config[];
  } = {}) {
    return new ESLint({
      cwd: root,
      overrideConfigFile: true,
      fix,
      overrideConfig: [
        ...preset(enabled),
        { settings: { tailwindcss: { cssConfigPath } } },
        ...overrides,
      ],
    });
  }

  async function lint(
    code: string,
    eslint = engine(),
    relativePath = 'Component.tsx',
  ) {
    const filePath = path.join(root, relativePath);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, code);
    const [result] = await eslint.lintText(code, { filePath });
    expect(result.messages.filter((message) => message.fatal)).toStrictEqual(
      [],
    );
    return result;
  }

  test.each([
    '<div className="site-owned framework-button" />;',
    'import styles from "./Component.module.css";\n<div className={clsx("site-owned", styles.root, "flex")} />;',
    'function Component({ className }) { return <div className={className} />; }',
    'function Component({ className }) { return <div className={clsx("flex", className)} />; }',
    'function Component({ forwardedClasses }) { return <div className={clsx("flex", forwardedClasses)} />; }',
    'function Component({ className }) { return <div className={`flex ${className}`} />; }',
  ])('accepts mixed styling without class allowlists: %s', async (code) => {
    const result = await lint(code);
    expect(
      result.messages.filter((m) => m.ruleId?.startsWith('tailwindcss/')),
    ).toStrictEqual([]);
  });

  test('retains contradictory utility diagnostics', async () => {
    const result = await lint('<div className="flex grid" />;');
    expect(result.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'tailwindcss/no-contradicting-classname',
          severity: 2,
        }),
      ]),
    );
  });

  test('retains compiler-based ordering diagnostics and fixes', async () => {
    const code = '<div className="p-4 flex" />;';
    const result = await lint(code);
    expect(result.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'tailwindcss/classnames-order',
          fix: expect.any(Object),
        }),
      ]),
    );
    const fixed = await lint(code, engine({ fix: true }));
    expect(fixed.output).toContain('className="flex p-4"');
    expect(
      fixed.messages.filter((m) => m.ruleId?.startsWith('tailwindcss/')),
    ).toStrictEqual([]);
  });

  test('disables Tailwind-only enforcement effectively and permits ordinary consumer overrides', async () => {
    const eslint = engine();
    const config = await eslint.calculateConfigForFile(
      path.join(root, 'Component.tsx'),
    );
    expect(config.rules['tailwindcss/no-custom-classname'][0]).toBe(0);
    expect(config.rules['tailwindcss/classnames-order'][0]).toBe(1);
    expect(config.rules['tailwindcss/no-contradicting-classname'][0]).toBe(2);
    expect(config.rules['no-console'][0]).toBe(2);
    expect(config.settings.tailwindcss.useLocalPkgWorkaround).toBe(false);

    const enforcing = engine({
      overrides: [
        {
          files: ['**/*.tsx'],
          rules: { 'tailwindcss/no-custom-classname': 'error' },
        },
      ],
    });
    const result = await lint('<div className="site-owned" />;', enforcing);
    expect(result.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'tailwindcss/no-custom-classname',
          severity: 2,
        }),
      ]),
    );
  });

  test('recognizes CSS-first theme utilities without a JavaScript Tailwind configuration', async () => {
    const enforcing = engine({
      overrides: [{ rules: { 'tailwindcss/no-custom-classname': 'error' } }],
    });
    const result = await lint('<div className="bg-brand" />;', enforcing);
    expect(
      result.messages.filter((m) => m.ruleId?.startsWith('tailwindcss/')),
    ).toStrictEqual([]);
  });

  test.each(['js', 'mjs', 'cjs', 'jsx', 'ts', 'mts', 'cts', 'tsx'])(
    'registers the plugin and overrides consistently for .%s configuration/source files',
    async (extension) => {
      const eslint = engine();
      const config = await eslint.calculateConfigForFile(
        path.join(root, `tool.config.${extension}`),
      );
      expect(config.plugins.tailwindcss).toBeDefined();
      expect(config.rules['tailwindcss/no-custom-classname'][0]).toBe(0);
      const result = await lint(
        'export const value = 1;\n',
        eslint,
        `tool.config.${extension}`,
      );
      expect(result.fatalErrorCount).toBe(0);
    },
  );

  test('does not require a stylesheet for disabled/non-Tailwind consumers and retains unrelated diagnostics', async () => {
    await fs.promises.rm(cssConfigPath);
    const result = await lint(
      'console.log("test");\n',
      engine({ enabled: false }),
    );
    expect(result.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'no-console', severity: 2 }),
      ]),
    );
    expect(
      result.messages.some((m) => m.ruleId?.startsWith('tailwindcss/')),
    ).toBe(false);
  });

  test('loads an enabled preset and lints configuration code without a stylesheet', async () => {
    await fs.promises.rm(cssConfigPath);
    await lint('export const value = 1;\n');
  });

  test.each(['.', 'packages/site'])(
    'resolves a consumer-owned relative entrypoint from the configuration directory %s, not the CWD or a nested package',
    async (configurationDirectory) => {
      const configRoot = path.join(root, configurationDirectory);
      const nestedRoot = path.join(configRoot, 'packages', 'component');
      await fs.promises.mkdir(path.join(configRoot, 'styles'), {
        recursive: true,
      });
      await fs.promises.mkdir(nestedRoot, { recursive: true });
      await fs.promises.copyFile(
        cssConfigPath,
        path.join(configRoot, 'styles', 'entry.css'),
      );
      await fs.promises.copyFile(
        path.join(root, 'tsconfig.json'),
        path.join(configRoot, 'tsconfig.json'),
      );
      await fs.promises.copyFile(
        path.join(root, 'package.json'),
        path.join(configRoot, 'package.json'),
      );
      await fs.promises.writeFile(
        path.join(nestedRoot, 'package.json'),
        '{"type":"module"}',
      );
      const entry = pathToFileURL(
        path.join(projectDir, 'dist', 'index.js'),
      ).href;
      const configPath = path.join(configRoot, 'eslint.config.mjs');
      await fs.promises.writeFile(
        configPath,
        `
import { fileURLToPath } from 'node:url';
import { createConfig } from ${JSON.stringify(entry)};
export default [
  ...createConfig({ root: fileURLToPath(new URL('.', import.meta.url)) }),
  {
    files: ['**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}'],
    settings: { tailwindcss: {
      cssConfigPath: fileURLToPath(new URL('./styles/entry.css', import.meta.url)),
    } },
    rules: { 'tailwindcss/no-custom-classname': 'error' },
  },
];
`,
      );
      const eslint = new ESLint({
        cwd: nestedRoot,
        overrideConfigFile: configPath,
      });
      const result = await lint(
        '<div className="bg-brand" />;',
        eslint,
        path.relative(root, path.join(nestedRoot, 'Component.tsx')),
      );
      expect(
        result.messages.filter((m) => m.ruleId?.startsWith('tailwindcss/')),
      ).toStrictEqual([]);
    },
  );

  test.each([
    [
      'function Component({ className }) { return <div className={className} />; }',
      false,
    ],
    [
      'function Component({ className }) { return <div className={clsx("flex", className)} />; }',
      true,
    ],
    [
      'function Component({ className }) { return <div className={`flex ${className}`} />; }',
      false,
    ],
  ] as const)(
    'checks forwarded values with the upstream plugin alone: %s',
    async (code, reportsIdentifier) => {
      const recommended = tailwindcss.configs.recommended as Linter.Config;
      const eslint = new ESLint({
        cwd: root,
        overrideConfigFile: true,
        overrideConfig: [
          recommended,
          {
            settings: { tailwindcss: { cssConfigPath } },
            rules: { 'tailwindcss/no-custom-classname': 'error' },
          },
        ],
      });
      const result = await lint(code, eslint, 'Component.jsx');
      const diagnostics = result.messages.filter(
        (m) => m.ruleId === 'tailwindcss/no-custom-classname',
      );
      if (reportsIdentifier) {
        expect(diagnostics).toEqual([
          expect.objectContaining({
            messageId: 'issue:unknown-classname',
            message: "Classname 'className' is not a Tailwind CSS class",
            severity: 2,
          }),
        ]);
      } else {
        expect(diagnostics).toStrictEqual([]);
      }
    },
  );
});
