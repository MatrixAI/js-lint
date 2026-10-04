import path from 'node:path';
import fs from 'node:fs';
import { buildPatterns } from '#eslint/utils.js';
import { resolveFilesFromPatterns } from '#utils.js';

describe('eslint target derivation', () => {
  test('guarded file discovery follows directory symlinks without cycling', async () => {
    const tmpRoot = await fs.promises.mkdtemp(
      path.join(tmpDir, 'domain-symlink-cycle-'),
    );

    try {
      const sourceDir = path.join(tmpRoot, 'src');
      const nestedDir = path.join(sourceDir, 'nested');

      await fs.promises.mkdir(nestedDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(sourceDir, 'index.ts'),
        'export const index = 1;\n',
        'utf8',
      );
      await fs.promises.writeFile(
        path.join(nestedDir, 'nested.ts'),
        'export const nested = 1;\n',
        'utf8',
      );
      await fs.promises.symlink(sourceDir, path.join(nestedDir, 'loop'), 'dir');

      const matchedFiles = resolveFilesFromPatterns(
        ['./src/**/*.ts'],
        ['.ts'],
        tmpRoot,
      ).map((p) => p.split(path.sep).join(path.posix.sep));

      expect(matchedFiles).toEqual(['src/index.ts', 'src/nested/nested.ts']);
    } finally {
      await fs.promises.rm(tmpRoot, { recursive: true, force: true });
    }
  });

  test('guarded file discovery skips external directory symlinks by default', async () => {
    const tmpRoot = await fs.promises.mkdtemp(
      path.join(tmpDir, 'domain-symlink-external-'),
    );

    try {
      const sourceDir = path.join(tmpRoot, 'src');
      const externalDir = path.join(tmpRoot, 'external');

      await fs.promises.mkdir(sourceDir, { recursive: true });
      await fs.promises.mkdir(externalDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(externalDir, 'external.ts'),
        'export const external = 1;\n',
        'utf8',
      );
      await fs.promises.symlink(
        externalDir,
        path.join(sourceDir, 'external-link'),
        'dir',
      );
      await fs.promises.symlink(
        externalDir,
        path.join(sourceDir, 'external-link-again'),
        'dir',
      );

      const matchedFiles = resolveFilesFromPatterns(
        ['./src/**/*.ts'],
        ['.ts'],
        tmpRoot,
      ).map((p) => p.split(path.sep).join(path.posix.sep));

      expect(matchedFiles).toEqual([]);
    } finally {
      await fs.promises.rm(tmpRoot, { recursive: true, force: true });
    }
  });

  test('guarded file discovery follows explicit external search roots', async () => {
    const tmpRoot = await fs.promises.mkdtemp(
      path.join(tmpDir, 'domain-symlink-explicit-external-'),
    );

    try {
      const sourceDir = path.join(tmpRoot, 'src');
      const externalDir = path.join(tmpRoot, 'external');
      const externalSourceDir = path.join(externalDir, 'src');

      await fs.promises.mkdir(sourceDir, { recursive: true });
      await fs.promises.mkdir(externalSourceDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(externalSourceDir, 'external.ts'),
        'export const external = 1;\n',
        'utf8',
      );
      await fs.promises.symlink(
        externalSourceDir,
        path.join(sourceDir, 'external-src'),
        'dir',
      );

      const matchedFiles = resolveFilesFromPatterns(
        ['./src/external-src/**/*.ts'],
        ['.ts'],
        tmpRoot,
      ).map((p) => p.split(path.sep).join(path.posix.sep));

      expect(matchedFiles).toEqual(['src/external-src/external.ts']);
    } finally {
      await fs.promises.rm(tmpRoot, { recursive: true, force: true });
    }
  });

  test('guarded file discovery prunes gitignored scratch paths', async () => {
    const tmpRoot = await fs.promises.mkdtemp(
      path.join(tmpDir, 'domain-symlink-gitignore-'),
    );

    try {
      await fs.promises.mkdir(path.join(tmpRoot, 'src'), { recursive: true });
      await fs.promises.mkdir(path.join(tmpRoot, 'tmp', 'src'), {
        recursive: true,
      });
      await fs.promises.writeFile(path.join(tmpRoot, '.gitignore'), '/tmp\n');
      await fs.promises.writeFile(
        path.join(tmpRoot, 'src', 'index.ts'),
        'export const index = 1;\n',
        'utf8',
      );
      await fs.promises.writeFile(
        path.join(tmpRoot, 'tmp', 'src', 'ignored.ts'),
        'export const ignored = 1;\n',
        'utf8',
      );

      const matchedFiles = resolveFilesFromPatterns(
        ['./**/*.ts'],
        ['.ts'],
        tmpRoot,
      ).map((p) => p.split(path.sep).join(path.posix.sep));

      expect(matchedFiles).toEqual(['src/index.ts']);
    } finally {
      await fs.promises.rm(tmpRoot, { recursive: true, force: true });
    }
  });

  test('guarded file discovery stops cross-repository tmp symlink cycles', async () => {
    const tmpRoot = await fs.promises.mkdtemp(
      path.join(tmpDir, 'domain-symlink-cross-repo-'),
    );

    try {
      const matrixRoot = path.join(tmpRoot, 'matrix.ai');
      const zetaRoot = path.join(tmpRoot, 'zeta.house');

      await fs.promises.mkdir(path.join(matrixRoot, 'src'), {
        recursive: true,
      });
      await fs.promises.mkdir(path.join(matrixRoot, 'tmp'), {
        recursive: true,
      });
      await fs.promises.mkdir(path.join(zetaRoot, 'src'), { recursive: true });
      await fs.promises.mkdir(path.join(zetaRoot, 'tmp'), { recursive: true });
      await fs.promises.writeFile(
        path.join(matrixRoot, '.gitignore'),
        '/tmp\n',
      );
      await fs.promises.writeFile(path.join(zetaRoot, '.gitignore'), '/tmp\n');
      await fs.promises.writeFile(
        path.join(matrixRoot, 'src', 'matrix.ts'),
        'export const matrix = 1;\n',
        'utf8',
      );
      await fs.promises.writeFile(
        path.join(zetaRoot, 'src', 'zeta.ts'),
        'export const zeta = 1;\n',
        'utf8',
      );
      await fs.promises.symlink(
        zetaRoot,
        path.join(matrixRoot, 'tmp', 'zeta.house'),
        'dir',
      );
      await fs.promises.symlink(
        matrixRoot,
        path.join(zetaRoot, 'tmp', 'matrix.ai'),
        'dir',
      );

      const matchedFiles = resolveFilesFromPatterns(
        ['./**/*.ts'],
        ['.ts'],
        matrixRoot,
      ).map((p) => p.split(path.sep).join(path.posix.sep));

      expect(matchedFiles).toEqual(['src/matrix.ts']);
      expect(matchedFiles.some((file) => file.includes('tmp/zeta.house'))).toBe(
        false,
      );
    } finally {
      await fs.promises.rm(tmpRoot, { recursive: true, force: true });
    }
  });

  test('preserves extension-bearing include entries while expanding extensionless entries', async () => {
    const tmpRoot = await fs.promises.mkdtemp(
      path.join(tmpDir, 'domain-eslint-patterns-'),
    );

    try {
      const pkgOne = path.join(tmpRoot, 'pkg-one');
      const pkgTwo = path.join(tmpRoot, 'pkg-two');

      await fs.promises.mkdir(pkgOne, { recursive: true });
      await fs.promises.mkdir(pkgTwo, { recursive: true });

      const pkgOneTsconfig = path.join(pkgOne, 'tsconfig.json');
      const pkgTwoTsconfig = path.join(pkgTwo, 'tsconfig.json');

      await fs.promises.writeFile(
        pkgOneTsconfig,
        JSON.stringify({ include: ['./src/**/*.tsx'] }, null, 2) + '\n',
        'utf8',
      );
      await fs.promises.writeFile(
        pkgTwoTsconfig,
        JSON.stringify({ include: ['./src/**/*'] }, null, 2) + '\n',
        'utf8',
      );

      const patterns = buildPatterns(
        [pkgOneTsconfig, pkgTwoTsconfig],
        [],
        tmpRoot,
        tmpRoot,
      );

      expect(patterns.files).toContain('pkg-one/src/**/*.tsx');
      expect(patterns.files).toContain(
        'pkg-two/src/**/*.{js,mjs,cjs,jsx,ts,tsx,mts,cts,json}',
      );
      expect(patterns.files).not.toContain(
        'pkg-one/src/**/*.tsx.{js,mjs,cjs,jsx,ts,tsx,mts,cts,json}',
      );
    } finally {
      await fs.promises.rm(tmpRoot, { recursive: true, force: true });
    }
  });

  test('exclude and forceInclude interactions are stable across multiple tsconfigs', async () => {
    const tmpRoot = await fs.promises.mkdtemp(
      path.join(tmpDir, 'domain-eslint-exclude-force-'),
    );

    try {
      const pkgOne = path.join(tmpRoot, 'pkg-one');
      const pkgTwo = path.join(tmpRoot, 'pkg-two');

      await fs.promises.mkdir(pkgOne, { recursive: true });
      await fs.promises.mkdir(pkgTwo, { recursive: true });

      const pkgOneTsconfig = path.join(pkgOne, 'tsconfig.json');
      const pkgTwoTsconfig = path.join(pkgTwo, 'tsconfig.json');

      await fs.promises.writeFile(
        pkgOneTsconfig,
        JSON.stringify(
          {
            include: ['./src/**/*'],
            exclude: ['./scripts/**'],
          },
          null,
          2,
        ) + '\n',
        'utf8',
      );
      await fs.promises.writeFile(
        pkgTwoTsconfig,
        JSON.stringify(
          {
            include: ['./src/**/*'],
            exclude: ['./generated/**'],
          },
          null,
          2,
        ) + '\n',
        'utf8',
      );

      const patterns = buildPatterns(
        [pkgOneTsconfig, pkgTwoTsconfig],
        ['pkg-one/scripts'],
        tmpRoot,
        tmpRoot,
      );

      expect(patterns.files).toEqual(
        expect.arrayContaining([
          'pkg-one/scripts/**/*.{js,mjs,cjs,jsx,ts,tsx,mts,cts,json}',
        ]),
      );
      expect(patterns.ignore).not.toContain('pkg-one/scripts/**');
      expect(patterns.ignore).toContain('pkg-two/generated/**');
    } finally {
      await fs.promises.rm(tmpRoot, { recursive: true, force: true });
    }
  });
});
