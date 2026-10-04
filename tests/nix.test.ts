import path from 'node:path';
import fs from 'node:fs';
import childProcess from 'node:child_process';
import Logger, { LogLevel } from '@matrixai/logger';
import { jest } from '@jest/globals';
import {
  createBuiltInDomainRegistry,
  evaluateLintDomains,
  runLintDomains,
} from '#domains.js';

const testLogger = new Logger('matrixai-lint-test', LogLevel.INFO, []);

describe('nix domain', () => {
  test('nix detection defaults include root nix files and nix directory glob', async () => {
    const tmpRoot = await fs.promises.mkdtemp(
      path.join(tmpDir, 'domain-nix-default-roots-'),
    );

    const previousCwd = process.cwd();
    const spawnSyncMock = jest
      .spyOn(childProcess, 'spawnSync')
      .mockImplementation((file: string, args?: readonly string[]) => {
        const commandName = args?.[0];
        const status =
          (file === 'which' || file === 'where') && commandName === 'nixfmt'
            ? 0
            : 1;

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

    try {
      process.chdir(tmpRoot);

      await fs.promises.writeFile(
        path.join(tmpRoot, 'flake.nix'),
        '{ }\n',
        'utf8',
      );
      await fs.promises.writeFile(
        path.join(tmpRoot, 'default.nix'),
        '{ }\n',
        'utf8',
      );
      await fs.promises.mkdir(path.join(tmpRoot, 'nix', 'modules'), {
        recursive: true,
      });
      await fs.promises.writeFile(
        path.join(tmpRoot, 'nix', 'modules', 'service.nix'),
        '{ }\n',
        'utf8',
      );

      const registry = createBuiltInDomainRegistry({
        prettierConfigPath: path.join(tmpRoot, 'prettier.config.js'),
      });

      const decisions = await evaluateLintDomains({
        registry,
        selectedDomains: new Set(['nix']),
        explicitlyRequestedDomains: new Set(['nix']),
        selectionSources: new Map([['nix', 'domain-flag']]),
        executionOrder: ['eslint', 'shell', 'markdown', 'svg', 'nix', 'sql'],
        context: {
          fix: false,
          logger: testLogger,
          isConfigValid: true,
        },
      });

      const nixDecision = decisions.find(
        (decision) => decision.domain === 'nix',
      );
      const matchedFiles = (nixDecision?.detection?.matchedFiles ?? []).map(
        (p) => p.split(path.sep).join(path.posix.sep),
      );

      expect(nixDecision?.plannedAction).toBe('run');
      expect(matchedFiles).toEqual(
        expect.arrayContaining([
          'flake.nix',
          'default.nix',
          'nix/modules/service.nix',
        ]),
      );
    } finally {
      spawnSyncMock.mockRestore();
      process.chdir(previousCwd);
      await fs.promises.rm(tmpRoot, { recursive: true, force: true });
    }
  });

  test('nix detection and run resolve explicit globs consistently', async () => {
    const tmpRoot = await fs.promises.mkdtemp(
      path.join(tmpDir, 'domain-nix-glob-consistency-'),
    );

    const previousCwd = process.cwd();
    const execFileSyncMock = jest
      .spyOn(childProcess, 'execFileSync')
      .mockImplementation(
        (_file: string, _args?: readonly string[] | undefined) =>
          Buffer.from(''),
      );
    const spawnSyncMock = jest
      .spyOn(childProcess, 'spawnSync')
      .mockImplementation((file: string, args?: readonly string[]) => {
        const commandName = args?.[0];
        const status =
          (file === 'which' || file === 'where') && commandName === 'nixfmt'
            ? 0
            : 1;

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

    try {
      process.chdir(tmpRoot);

      await fs.promises.mkdir(path.join(tmpRoot, 'infra', 'nix'), {
        recursive: true,
      });
      await fs.promises.writeFile(
        path.join(tmpRoot, 'infra', 'nix', 'a.nix'),
        '{ }\n',
        'utf8',
      );
      await fs.promises.writeFile(
        path.join(tmpRoot, 'infra', 'nix', 'b.nix'),
        '{ }\n',
        'utf8',
      );

      const registry = createBuiltInDomainRegistry({
        prettierConfigPath: path.join(tmpRoot, 'prettier.config.js'),
      });

      const decisions = await evaluateLintDomains({
        registry,
        selectedDomains: new Set(['nix']),
        explicitlyRequestedDomains: new Set(['nix']),
        selectionSources: new Map([['nix', 'domain-flag']]),
        executionOrder: ['eslint', 'shell', 'markdown', 'svg', 'nix', 'sql'],
        context: {
          fix: false,
          logger: testLogger,
          isConfigValid: true,
          nixPatterns: ['./infra/nix/**/*.nix'],
        },
      });

      const nixDecision = decisions.find(
        (decision) => decision.domain === 'nix',
      );
      const matchedFiles = (nixDecision?.detection?.matchedFiles ?? []).map(
        (p) => p.split(path.sep).join(path.posix.sep),
      );

      expect(nixDecision?.plannedAction).toBe('run');
      expect(matchedFiles).toEqual(
        expect.arrayContaining(['infra/nix/a.nix', 'infra/nix/b.nix']),
      );

      const hadFailure = await runLintDomains({
        registry,
        selectedDomains: new Set(['nix']),
        explicitlyRequestedDomains: new Set(['nix']),
        selectionSources: new Map([['nix', 'domain-flag']]),
        executionOrder: ['eslint', 'shell', 'markdown', 'svg', 'nix', 'sql'],
        context: {
          fix: false,
          logger: testLogger,
          isConfigValid: true,
          nixPatterns: ['./infra/nix/**/*.nix'],
        },
      });

      expect(hadFailure).toBe(false);
      const nixfmtCall = execFileSyncMock.mock.calls.find(
        ([file]) => file === 'nixfmt',
      );
      const nixfmtArgs = nixfmtCall?.[1] as string[] | undefined;
      const normalizedNixfmtArgs = (nixfmtArgs ?? []).map((arg) =>
        arg.split(path.sep).join(path.posix.sep),
      );
      expect(normalizedNixfmtArgs).toEqual(
        expect.arrayContaining([
          '--check',
          'infra/nix/a.nix',
          'infra/nix/b.nix',
        ]),
      );
    } finally {
      spawnSyncMock.mockRestore();
      execFileSyncMock.mockRestore();
      process.chdir(previousCwd);
      await fs.promises.rm(tmpRoot, { recursive: true, force: true });
    }
  });
});
