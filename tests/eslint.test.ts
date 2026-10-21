import path from 'node:path';
import fs from 'node:fs';
import Logger, { LogLevel } from '@matrixai/logger';
import { parseLintConfig } from '#config.js';
import { createBuiltInDomainRegistry, evaluateLintDomains } from '#domains.js';
import { DEFAULT_TAILWIND_CSS_FILES } from '#utils.js';
import eslintConfig, { createEslintConfig } from '#configs/eslint.js';

const testLogger = new Logger('matrixai-lint-test', LogLevel.INFO, []);

function resolvedConfig(tailwind: 'enabled' | 'disabled') {
  return parseLintConfig({
    rawConfig: {
      version: 2,
      domains: { eslint: { tailwind } },
    },
    repoRoot: process.cwd(),
    configFilePath: path.join(process.cwd(), 'matrixai-lint-config.json'),
  });
}

function hasTailwindRules(config: ReturnType<typeof createEslintConfig>) {
  return config.some((configEntry) =>
    Object.keys(configEntry.rules ?? {}).some((ruleName) =>
      ruleName.startsWith('tailwindcss/'),
    ),
  );
}

function tailwindSettings(config: ReturnType<typeof createEslintConfig>) {
  return config
    .map((configEntry) => configEntry.settings?.tailwindcss)
    .find((settings) => settings != null) as
    | { cssFiles?: readonly string[] }
    | undefined;
}

describe('eslint domain', () => {
  test('eslint detection derives scope from canonical multi-tsconfig union', async () => {
    const tmpRoot = await fs.promises.mkdtemp(
      path.join(tmpDir, 'domain-eslint-union-'),
    );

    const previousCwd = process.cwd();

    try {
      process.chdir(tmpRoot);

      await fs.promises.mkdir(path.join(tmpRoot, 'pkg-a', 'src'), {
        recursive: true,
      });
      await fs.promises.mkdir(path.join(tmpRoot, 'pkg-b', 'src'), {
        recursive: true,
      });

      await fs.promises.writeFile(
        path.join(tmpRoot, 'pkg-a', 'src', 'a.ts'),
        'export const a = 1;\n',
        'utf8',
      );
      await fs.promises.writeFile(
        path.join(tmpRoot, 'pkg-b', 'src', 'b.ts'),
        'export const b = 1;\n',
        'utf8',
      );

      await fs.promises.writeFile(
        path.join(tmpRoot, 'pkg-a', 'tsconfig.json'),
        JSON.stringify({ include: ['./src/**/*'] }, null, 2) + '\n',
        'utf8',
      );
      await fs.promises.writeFile(
        path.join(tmpRoot, 'pkg-b', 'tsconfig.json'),
        JSON.stringify({ include: ['./src/**/*'] }, null, 2) + '\n',
        'utf8',
      );

      await fs.promises.writeFile(
        path.join(tmpRoot, 'matrixai-lint-config.json'),
        JSON.stringify(
          {
            version: 2,
            root: '.',
            domains: {
              eslint: {
                tsconfigPaths: [
                  './pkg-a/tsconfig.json',
                  './pkg-b/tsconfig.json',
                ],
              },
            },
          },
          null,
          2,
        ) + '\n',
        'utf8',
      );

      const registry = createBuiltInDomainRegistry({
        prettierConfigPath: path.join(tmpRoot, 'prettier.config.js'),
      });

      const decisions = await evaluateLintDomains({
        registry,
        selectedDomains: new Set(['eslint']),
        explicitlyRequestedDomains: new Set(['eslint']),
        selectionSources: new Map([['eslint', 'domain-flag']]),
        executionOrder: ['eslint', 'shell', 'markdown', 'svg', 'nix', 'sql'],
        context: {
          fix: false,
          logger: testLogger,
          isConfigValid: true,
        },
      });

      const eslintDecision = decisions.find(
        (decision) => decision.domain === 'eslint',
      );
      const matchedFiles = (eslintDecision?.detection?.matchedFiles ?? []).map(
        (p) => p.split(path.sep).join(path.posix.sep),
      );

      expect(matchedFiles).toEqual(
        expect.arrayContaining(['pkg-a/src/a.ts', 'pkg-b/src/b.ts']),
      );
      expect(eslintDecision?.plannedAction).toBe('run');
    } finally {
      process.chdir(previousCwd);
      await fs.promises.rm(tmpRoot, { recursive: true, force: true });
    }
  });

  test('shared eslint config omits tailwind composition when auto detection is false', () => {
    expect(hasTailwindRules(eslintConfig)).toBe(false);
    expect(tailwindSettings(eslintConfig)).toBeUndefined();
  });

  test('shared eslint config conditionally composes bounded tailwind support', () => {
    const enabledConfig = createEslintConfig(resolvedConfig('enabled'));
    const disabledConfig = createEslintConfig(resolvedConfig('disabled'));
    const enabledSettings = tailwindSettings(enabledConfig);

    expect(hasTailwindRules(enabledConfig)).toBe(true);
    expect(enabledSettings?.cssFiles).toStrictEqual([
      ...DEFAULT_TAILWIND_CSS_FILES,
    ]);
    expect(enabledSettings?.cssFiles).not.toContain('**/*.css');
    expect(hasTailwindRules(disabledConfig)).toBe(false);
    expect(tailwindSettings(disabledConfig)).toBeUndefined();
  });
});
