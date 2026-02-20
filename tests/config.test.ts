import path from 'node:path';
import fs from 'node:fs';
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

  test('parseLintConfig accepts explicit config schema and normalizes root-relative paths', async () => {
    const repoRoot = await fs.promises.mkdtemp(path.join(tmpDir, 'repo-root-'));
    const configFilePath = path.join(repoRoot, 'matrixai-lint-config.json');
    const workspaceRoot = path.join(repoRoot, 'workspace');
    const rootTsconfigPath = path.join(workspaceRoot, 'tsconfig.json');
    const coreTsconfigPath = path.join(
      workspaceRoot,
      'packages',
      'core',
      'tsconfig.json',
    );

    try {
      await fs.promises.mkdir(path.dirname(coreTsconfigPath), {
        recursive: true,
      });
      await fs.promises.writeFile(
        rootTsconfigPath,
        JSON.stringify({ include: ['./src/**/*'] }, null, 2) + '\n',
        'utf8',
      );
      await fs.promises.writeFile(
        coreTsconfigPath,
        JSON.stringify({ include: ['./src/**/*'] }, null, 2) + '\n',
        'utf8',
      );

      const resolved = parseLintConfig({
        rawConfig: {
          version: 2,
          root: './workspace',
          domains: {
            eslint: {
              tsconfigPaths: [
                './tsconfig.json',
                './packages/core/tsconfig.json',
                './packages/core/tsconfig.json',
                './missing/tsconfig.json',
              ],
              forceInclude: ['./scripts', './src/overrides', './scripts', ''],
            },
          },
        },
        repoRoot,
        configFilePath,
      });

      expect(resolved.source).toBe('config');
      expect(resolved.root).toBe(path.resolve(repoRoot, 'workspace'));
      expect(resolved.domains.eslint.tsconfigPaths).toStrictEqual([
        path.resolve(repoRoot, 'workspace', 'packages/core', 'tsconfig.json'),
        path.resolve(repoRoot, 'workspace', 'tsconfig.json'),
      ]);
      expect(resolved.domains.eslint.forceInclude).toStrictEqual([
        'scripts',
        'src/overrides',
      ]);
    } finally {
      await fs.promises.rm(repoRoot, { recursive: true, force: true });
    }
  });

  test('parseLintConfig deterministically filters unreadable and missing tsconfig paths', async () => {
    const repoRoot = await fs.promises.mkdtemp(
      path.join(tmpDir, 'repo-readability-'),
    );
    const configFilePath = path.join(repoRoot, 'matrixai-lint-config.json');
    const workspaceRoot = path.join(repoRoot, 'workspace');

    const validA = path.join(workspaceRoot, 'a', 'tsconfig.json');
    const validB = path.join(workspaceRoot, 'b', 'tsconfig.json');
    const broken = path.join(workspaceRoot, 'broken', 'tsconfig.json');

    try {
      await fs.promises.mkdir(path.dirname(validA), { recursive: true });
      await fs.promises.mkdir(path.dirname(validB), { recursive: true });
      await fs.promises.mkdir(path.dirname(broken), { recursive: true });

      await fs.promises.writeFile(
        validA,
        JSON.stringify({ include: ['./src/**/*'] }, null, 2) + '\n',
        'utf8',
      );
      await fs.promises.writeFile(
        validB,
        JSON.stringify({ include: ['./src/**/*'] }, null, 2) + '\n',
        'utf8',
      );
      await fs.promises.writeFile(broken, '{"include": ["./src/**/*"]', 'utf8');

      const resolved = parseLintConfig({
        rawConfig: {
          version: 2,
          root: './workspace',
          domains: {
            eslint: {
              tsconfigPaths: [
                './b/tsconfig.json',
                './a/tsconfig.json',
                './broken/tsconfig.json',
                './missing/tsconfig.json',
                './a/tsconfig.json',
              ],
            },
          },
        },
        repoRoot,
        configFilePath,
      });

      expect(resolved.domains.eslint.tsconfigPaths).toStrictEqual([
        path.resolve(repoRoot, 'workspace', 'a', 'tsconfig.json'),
        path.resolve(repoRoot, 'workspace', 'b', 'tsconfig.json'),
      ]);
    } finally {
      await fs.promises.rm(repoRoot, { recursive: true, force: true });
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
