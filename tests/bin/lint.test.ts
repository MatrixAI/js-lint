import path from 'node:path';
import fs from 'node:fs';
import childProcess from 'node:child_process';
import { jest } from '@jest/globals';
import main from '#bin/lint.js';

describe('matrixai-lint CLI domain semantics', () => {
  let capturedExecCalls: Array<{
    file: string;
    args: string[];
  }>;
  let dataDir: string;
  let previousCwd: string;

  beforeEach(async () => {
    capturedExecCalls = [];
    previousCwd = process.cwd();
    dataDir = await fs.promises.mkdtemp(
      path.join(globalThis.tmpDir, 'lint-test-'),
    );
    process.chdir(dataDir);

    await fs.promises.writeFile(
      path.join(dataDir, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: {
            strict: true,
            noEmit: true,
          },
          include: ['src/**/*'],
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );

    await fs.promises.mkdir(path.join(dataDir, 'src'), { recursive: true });
    await fs.promises.writeFile(
      path.join(dataDir, 'src', 'index.ts'),
      'export const a = 1;\n',
      'utf8',
    );
    await fs.promises.mkdir(path.join(dataDir, 'scripts'), { recursive: true });
    await fs.promises.writeFile(
      path.join(dataDir, 'scripts', 'task.sh'),
      '#!/usr/bin/env sh\necho ok\n',
      'utf8',
    );

    jest
      .spyOn(childProcess, 'execFileSync')
      .mockImplementation(
        (file: string, args?: readonly string[] | undefined) => {
          capturedExecCalls.push({ file, args: [...(args ?? [])] });
          return Buffer.from('');
        },
      );

    jest
      .spyOn(process, 'exit')
      .mockImplementation(
        (code?: number | string | null | undefined): never => {
          throw new Error(`process.exit:${String(code ?? 0)}`);
        },
      );
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    process.chdir(previousCwd);
    await fs.promises.rm(dataDir, { recursive: true, force: true });
  });

  test('--eslint no longer triggers shell/markdown domains', async () => {
    await expect(
      main([
        'node',
        'matrixai-lint',
        '--eslint',
        'src/**/*.{ts,tsx}',
        '--eslint-config',
        './missing-eslint-config.mjs',
      ]),
    ).rejects.toBeDefined();

    const shellCalls = capturedExecCalls.filter((c) => c.file === 'shellcheck');
    expect(shellCalls).toHaveLength(0);

    const prettierCalls = capturedExecCalls.filter(
      (c) =>
        c.file === 'prettier' ||
        c.args.some((arg) => /prettier\.cjs$/.test(arg)),
    );
    expect(prettierCalls).toHaveLength(0);
  });

  test('explicit shell request + missing shellcheck fails', async () => {
    jest
      .spyOn(childProcess, 'spawnSync')
      .mockImplementation((file: string, args?: readonly string[]) => {
        const commandName = args?.[0];
        const status =
          (file === 'which' || file === 'where') && commandName === 'shellcheck'
            ? 1
            : 0;

        return {
          pid: 0,
          output: [null, null, null],
          stdout: null,
          stderr: null,
          status,
          signal: null,
          error: undefined,
        } as unknown as ReturnType<typeof childProcess.spawnSync>;
      });

    await expect(
      main([
        'node',
        'matrixai-lint',
        '--domain',
        'shell',
        '--shell',
        'scripts',
      ]),
    ).rejects.toBeDefined();

    const shellcheckCall = capturedExecCalls.find(
      (c) => c.file === 'shellcheck',
    );
    expect(shellcheckCall).toBeUndefined();
  });

  test('default shell missing shellcheck warns/skips (non-fatal unless other failures)', async () => {
    await fs.promises.writeFile(
      path.join(dataDir, 'README.md'),
      '# fixture\n',
      'utf8',
    );
    await fs.promises.mkdir(path.join(dataDir, 'docs'), { recursive: true });
    await fs.promises.writeFile(
      path.join(dataDir, 'docs', 'guide.md'),
      '# guide\n',
      'utf8',
    );

    jest
      .spyOn(childProcess, 'spawnSync')
      .mockImplementation((file: string, args?: readonly string[]) => {
        const commandName = args?.[0];
        const status =
          (file === 'which' || file === 'where') && commandName === 'shellcheck'
            ? 1
            : 0;

        return {
          pid: 0,
          output: [null, null, null],
          stdout: null,
          stderr: null,
          status,
          signal: null,
          error: undefined,
        } as unknown as ReturnType<typeof childProcess.spawnSync>;
      });

    await main(['node', 'matrixai-lint']);

    const shellcheckCall = capturedExecCalls.find(
      (c) => c.file === 'shellcheck',
    );
    expect(shellcheckCall).toBeUndefined();

    const prettierCalls = capturedExecCalls.filter(
      (c) =>
        c.file === 'prettier' ||
        c.args.some((arg) => /prettier\.cjs$/.test(arg)),
    );
    expect(prettierCalls.length).toBeGreaterThan(0);
  });

  test('aggregate failure is not masked when no markdown files are present', async () => {
    await expect(
      main([
        'node',
        'matrixai-lint',
        '--eslint-config',
        './missing-eslint-config.mjs',
        '--skip-domain',
        'shell',
      ]),
    ).rejects.toBeDefined();
  });

  test('--list-domains exits early without lint execution', async () => {
    const stderrWriteSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);

    await main(['node', 'matrixai-lint', '--list-domains']);

    expect(capturedExecCalls).toHaveLength(0);
    expect(stderrWriteSpy).toHaveBeenCalledWith(
      expect.stringContaining('INFO:matrixai-lint:Available lint domains:'),
    );
  });

  test('--explain prints per-domain decision data', async () => {
    const stderrWriteSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);

    await main(['node', 'matrixai-lint', '--explain', '--domain', 'markdown']);

    expect(stderrWriteSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'INFO:matrixai-lint:[matrixai-lint] Domain execution plan:',
      ),
    );
    expect(stderrWriteSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'INFO:matrixai-lint:[matrixai-lint]  -  domain: markdown',
      ),
    );
    expect(stderrWriteSpy).toHaveBeenCalledWith(
      expect.stringContaining('planned-action'),
    );
  });

  test('canonical lint script flags are accepted by main', async () => {
    await expect(
      main([
        'node',
        'matrixai-lint',
        '--domain',
        'eslint',
        'shell',
        'markdown',
        '--eslint',
        '{src,scripts,tests}/**/*.{js,mjs,ts,mts,jsx,tsx}',
        '--shell',
        'src',
        'scripts',
        'tests',
      ]),
    ).rejects.toBeDefined();
  });

  test('unknown option handling rejects typoed flags', async () => {
    await expect(
      main(['node', 'matrixai-lint', '--eslnt']),
    ).rejects.toBeDefined();
  });

  test('verbose flag is accepted and stacks', async () => {
    await expect(
      main(['node', 'matrixai-lint', '-v', '-v', '--domain', 'markdown']),
    ).resolves.toBeUndefined();
  });
});
