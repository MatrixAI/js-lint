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
      expect(resolved.domains.eslint.targets).toStrictEqual([]);
      expect(resolved.domains.eslint.tailwind).toBe('auto');
      expect(resolved.domains.eslint.tailwindEnabled).toBe(false);
      expect(resolved.domains.shell.targets).toStrictEqual([]);
      expect(resolved.domains.markdown.targets).toStrictEqual([]);
      expect(resolved.domains.svg.targets).toStrictEqual([]);
      expect(resolved.domains.nix.targets).toStrictEqual([]);
      expect(resolved.domains.sql.targets).toStrictEqual([]);
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
              targets: ['./src', './scripts', './src', ''],
              tsconfigPaths: [
                './tsconfig.json',
                './packages/core/tsconfig.json',
                './packages/core/tsconfig.json',
                './missing/tsconfig.json',
              ],
              forceInclude: ['./scripts', './src/overrides', './scripts', ''],
              tailwind: 'disabled',
            },
            shell: {
              targets: ['./scripts/**/*.sh', './scripts/**/*.sh'],
            },
            markdown: {
              targets: './docs',
            },
            svg: {
              targets: ['./assets/**/*.svg'],
            },
            nix: {
              targets: ['./nix', 1, null],
            },
            sql: {
              targets: [' ./db/**/*.sql ', './migrations'],
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
      expect(resolved.domains.eslint.targets).toStrictEqual([
        'workspace/scripts',
        'workspace/src',
      ]);
      expect(resolved.domains.eslint.tailwind).toBe('disabled');
      expect(resolved.domains.eslint.tailwindEnabled).toBe(false);
      expect(resolved.domains.shell.targets).toStrictEqual([
        'workspace/scripts/**/*.sh',
      ]);
      expect(resolved.domains.markdown.targets).toStrictEqual([
        'workspace/docs',
      ]);
      expect(resolved.domains.svg.targets).toStrictEqual([
        'workspace/assets/**/*.svg',
      ]);
      expect(resolved.domains.nix.targets).toStrictEqual(['workspace/nix']);
      expect(resolved.domains.sql.targets).toStrictEqual([
        'workspace/db/**/*.sql',
        'workspace/migrations',
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

      const expected = [
        path.resolve(repoRoot, 'workspace', 'a', 'tsconfig.json'),
        path.resolve(repoRoot, 'workspace', 'b', 'tsconfig.json'),
      ].map((p) => p.split(path.sep).join(path.posix.sep));

      const actual = resolved.domains.eslint.tsconfigPaths.map((p) =>
        p.split(path.sep).join(path.posix.sep),
      );

      expect(actual).toStrictEqual(expected);
    } finally {
      await fs.promises.rm(repoRoot, { recursive: true, force: true });
    }
  });

  test('parseLintConfig honors explicit tailwind modes', () => {
    const repoRoot = path.join(tmpDir, 'tailwind-explicit-modes');
    const configFilePath = path.join(repoRoot, 'matrixai-lint-config.json');

    const enabled = parseLintConfig({
      rawConfig: {
        version: 2,
        domains: { eslint: { tailwind: 'enabled' } },
      },
      repoRoot,
      configFilePath,
    });
    const disabled = parseLintConfig({
      rawConfig: {
        version: 2,
        domains: { eslint: { tailwind: 'disabled' } },
      },
      repoRoot,
      configFilePath,
    });

    expect(enabled.domains.eslint.tailwind).toBe('enabled');
    expect(enabled.domains.eslint.tailwindEnabled).toBe(true);
    expect(disabled.domains.eslint.tailwind).toBe('disabled');
    expect(disabled.domains.eslint.tailwindEnabled).toBe(false);
  });

  test('tailwind auto mode detects a direct package declaration', async () => {
    const repoRoot = await fs.promises.mkdtemp(
      path.join(tmpDir, 'tailwind-package-'),
    );

    try {
      await fs.promises.writeFile(
        path.join(repoRoot, 'package.json'),
        JSON.stringify(
          { devDependencies: { tailwindcss: '^4.0.0' } },
          null,
          2,
        ) + '\n',
        'utf8',
      );

      const resolved = resolveLintConfig(repoRoot);

      expect(resolved.domains.eslint.tailwind).toBe('auto');
      expect(resolved.domains.eslint.tailwindEnabled).toBe(true);
    } finally {
      await fs.promises.rm(repoRoot, { recursive: true, force: true });
    }
  });

  test('tailwind auto mode detects a root tailwind config file', async () => {
    const repoRoot = await fs.promises.mkdtemp(
      path.join(tmpDir, 'tailwind-config-'),
    );

    try {
      await fs.promises.writeFile(
        path.join(repoRoot, 'tailwind.config.ts'),
        'export default {};\n',
        'utf8',
      );

      const resolved = resolveLintConfig(repoRoot);

      expect(resolved.domains.eslint.tailwind).toBe('auto');
      expect(resolved.domains.eslint.tailwindEnabled).toBe(true);
    } finally {
      await fs.promises.rm(repoRoot, { recursive: true, force: true });
    }
  });

  test('tailwind auto mode ignores transitive installed dependencies', async () => {
    const repoRoot = await fs.promises.mkdtemp(
      path.join(tmpDir, 'tailwind-transitive-'),
    );

    try {
      await fs.promises.mkdir(
        path.join(repoRoot, 'node_modules', 'tailwindcss'),
        { recursive: true },
      );
      await fs.promises.writeFile(
        path.join(repoRoot, 'package.json'),
        JSON.stringify(
          { devDependencies: { '@matrixai/lint': '^0.6.0' } },
          null,
          2,
        ) + '\n',
        'utf8',
      );
      await fs.promises.writeFile(
        path.join(repoRoot, 'node_modules', 'tailwindcss', 'package.json'),
        JSON.stringify({ name: 'tailwindcss', version: '4.0.0' }) + '\n',
        'utf8',
      );

      const resolved = resolveLintConfig(repoRoot);

      expect(resolved.domains.eslint.tailwind).toBe('auto');
      expect(resolved.domains.eslint.tailwindEnabled).toBe(false);
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

    expect(() =>
      parseLintConfig({
        rawConfig: {
          version: 2,
          domains: { eslint: { tailwind: 'sometimes' } },
        },
        repoRoot,
        configFilePath,
      }),
    ).toThrow(
      'domains.eslint.tailwind must be "auto", "enabled", or "disabled"',
    );
  });
});
