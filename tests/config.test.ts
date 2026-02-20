import path from 'node:path';
import fs from 'node:fs';
import { jest } from '@jest/globals';
import { parseLintConfig, resolveLintConfig } from '#config.js';

describe('lint config schema', () => {
  test('resolveLintConfig falls back to repo root tsconfig when config file is absent', async () => {
    const tmpRoot = await fs.promises.mkdtemp(
      path.join(tmpDir, 'lint-config-'),
    );

    try {
      const tsconfigPath = path.join(tmpRoot, 'tsconfig.json');
      await fs.promises.writeFile(
        tsconfigPath,
        JSON.stringify({ include: ['src/**/*'] }, null, 2) + '\n',
        'utf8',
      );

      const resolved = resolveLintConfig(tmpRoot);

      expect(resolved.version).toBe(2);
      expect(resolved.source).toBe('default');
      expect(resolved.domains.eslint.tsconfigPaths).toStrictEqual([
        tsconfigPath,
      ]);
      expect(resolved.domains.eslint.forceInclude).toStrictEqual([]);
    } finally {
      await fs.promises.rm(tmpRoot, { recursive: true, force: true });
    }
  });

  test('parseLintConfig accepts explicit config schema and normalizes root-relative paths', () => {
    const repoRoot = path.resolve('/tmp', 'repo-root');
    const configFilePath = path.join(repoRoot, 'matrixai-lint-config.json');

    const existsSpy = jest
      .spyOn(fs, 'existsSync')
      .mockImplementation((targetPath) => {
        const normalized = path.resolve(String(targetPath));
        return (
          normalized === path.resolve(repoRoot, 'workspace', 'tsconfig.json') ||
          normalized ===
            path.resolve(
              repoRoot,
              'workspace',
              'packages',
              'core',
              'tsconfig.json',
            )
        );
      });

    try {
      const resolved = parseLintConfig({
        rawConfig: {
          version: 2,
          root: './workspace',
          domains: {
            eslint: {
              tsconfigPaths: [
                './tsconfig.json',
                './packages/core/tsconfig.json',
                './missing/tsconfig.json',
              ],
              forceInclude: ['./scripts', './src/overrides'],
            },
          },
        },
        repoRoot,
        configFilePath,
      });

      expect(resolved.source).toBe('config');
      expect(resolved.root).toBe(path.resolve(repoRoot, 'workspace'));
      expect(resolved.domains.eslint.tsconfigPaths).toStrictEqual([
        path.resolve(repoRoot, 'workspace', 'tsconfig.json'),
        path.resolve(repoRoot, 'workspace', 'packages/core', 'tsconfig.json'),
      ]);
      expect(resolved.domains.eslint.forceInclude).toStrictEqual([
        'scripts',
        'src/overrides',
      ]);
    } finally {
      existsSpy.mockRestore();
    }
  });

  test('parseLintConfig rejects missing version and non-supported version', () => {
    const repoRoot = '/tmp/repo';
    const configFilePath = '/tmp/repo/matrixai-lint-config.json';

    expect(() =>
      parseLintConfig({
        rawConfig: {
          tsconfigPaths: ['./tsconfig.json'],
        },
        repoRoot,
        configFilePath,
      }),
    ).toThrow('must declare "version": 2');

    expect(() =>
      parseLintConfig({
        rawConfig: {
          version: 3,
        },
        repoRoot,
        configFilePath,
      }),
    ).toThrow('must declare "version": 2');
  });
});
