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

describe('shell domain', () => {
  test('shell detection and run resolve globs consistently from explicit patterns', async () => {
    const tmpRoot = await fs.promises.mkdtemp(
      path.join(tmpDir, 'domain-shell-glob-consistency-'),
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
          (file === 'which' || file === 'where') && commandName === 'shellcheck'
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

      await fs.promises.mkdir(path.join(tmpRoot, 'scripts', 'nested'), {
        recursive: true,
      });

      await fs.promises.writeFile(
        path.join(tmpRoot, 'scripts', 'lint.sh'),
        '#!/usr/bin/env sh\necho lint\n',
        'utf8',
      );

      await fs.promises.writeFile(
        path.join(tmpRoot, 'scripts', 'nested', 'test.sh'),
        '#!/usr/bin/env sh\necho test\n',
        'utf8',
      );

      const registry = createBuiltInDomainRegistry({
        prettierConfigPath: path.join(tmpRoot, 'prettier.config.js'),
      });

      const decisions = await evaluateLintDomains({
        registry,
        selectedDomains: new Set(['shell']),
        explicitlyRequestedDomains: new Set(['shell']),
        selectionSources: new Map([['shell', 'domain-flag']]),
        executionOrder: ['eslint', 'shell', 'markdown', 'svg', 'nix', 'sql'],
        context: {
          fix: false,
          logger: testLogger,
          isConfigValid: true,
          shellPatterns: ['./scripts/**/*.sh'],
        },
      });

      const shellDecision = decisions.find(
        (decision) => decision.domain === 'shell',
      );
      const matchedFiles = (shellDecision?.detection?.matchedFiles ?? []).map(
        (p) => p.split(path.sep).join(path.posix.sep),
      );

      expect(shellDecision?.plannedAction).toBe('run');
      expect(matchedFiles).toEqual(
        expect.arrayContaining(['scripts/lint.sh', 'scripts/nested/test.sh']),
      );

      const hadFailure = await runLintDomains({
        registry,
        selectedDomains: new Set(['shell']),
        explicitlyRequestedDomains: new Set(['shell']),
        selectionSources: new Map([['shell', 'domain-flag']]),
        executionOrder: ['eslint', 'shell', 'markdown', 'svg', 'nix', 'sql'],
        context: {
          fix: false,
          logger: testLogger,
          isConfigValid: true,
          shellPatterns: ['./scripts/**/*.sh'],
        },
      });

      expect(hadFailure).toBe(false);
      const shellcheckCall = execFileSyncMock.mock.calls.find(
        ([file]) => file === 'shellcheck',
      );
      const shellcheckArgs = shellcheckCall?.[1] as string[] | undefined;
      const normalizedShellcheckArgs = (shellcheckArgs ?? []).map((arg) =>
        arg.split(path.sep).join(path.posix.sep),
      );
      expect(normalizedShellcheckArgs).toEqual(
        expect.arrayContaining(['scripts/lint.sh', 'scripts/nested/test.sh']),
      );
      expect(normalizedShellcheckArgs).toHaveLength(2);
    } finally {
      spawnSyncMock.mockRestore();
      execFileSyncMock.mockRestore();
      process.chdir(previousCwd);
      await fs.promises.rm(tmpRoot, { recursive: true, force: true });
    }
  });
});
