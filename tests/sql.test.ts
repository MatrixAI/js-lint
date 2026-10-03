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

describe('sql domain', () => {
  test('sql detection defaults include common SQL roots and root SQL files', async () => {
    const tmpRoot = await fs.promises.mkdtemp(
      path.join(tmpDir, 'domain-sql-default-roots-'),
    );

    const previousCwd = process.cwd();
    const spawnSyncMock = jest
      .spyOn(childProcess, 'spawnSync')
      .mockImplementation((file: string, args?: readonly string[]) => {
        const commandName = args?.[0];
        const status =
          (file === 'which' || file === 'where') && commandName === 'sqlfluff'
            ? 0
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

    try {
      process.chdir(tmpRoot);

      await fs.promises.writeFile(
        path.join(tmpRoot, 'schema.sql'),
        'SELECT 1;\n',
        'utf8',
      );
      await fs.promises.mkdir(path.join(tmpRoot, 'migrations'), {
        recursive: true,
      });
      await fs.promises.writeFile(
        path.join(tmpRoot, 'migrations', '001_init.sql'),
        'SELECT 1;\n',
        'utf8',
      );
      await fs.promises.mkdir(path.join(tmpRoot, 'other'), {
        recursive: true,
      });
      await fs.promises.writeFile(
        path.join(tmpRoot, 'other', 'skip.sql'),
        'SELECT 1;\n',
        'utf8',
      );

      const registry = createBuiltInDomainRegistry({
        prettierConfigPath: path.join(tmpRoot, 'prettier.config.js'),
      });

      const decisions = await evaluateLintDomains({
        registry,
        selectedDomains: new Set(['sql']),
        explicitlyRequestedDomains: new Set(['sql']),
        selectionSources: new Map([['sql', 'domain-flag']]),
        executionOrder: ['eslint', 'shell', 'markdown', 'svg', 'nix', 'sql'],
        context: {
          fix: false,
          logger: testLogger,
          isConfigValid: true,
        },
      });

      const sqlDecision = decisions.find(
        (decision) => decision.domain === 'sql',
      );
      const matchedFiles = (sqlDecision?.detection?.matchedFiles ?? []).map(
        (p) => p.split(path.sep).join(path.posix.sep),
      );

      expect(sqlDecision?.plannedAction).toBe('run');
      expect(matchedFiles).toEqual(
        expect.arrayContaining(['schema.sql', 'migrations/001_init.sql']),
      );
      expect(matchedFiles).not.toContain('other/skip.sql');
    } finally {
      spawnSyncMock.mockRestore();
      process.chdir(previousCwd);
      await fs.promises.rm(tmpRoot, { recursive: true, force: true });
    }
  });

  test('sql detection and run resolve explicit globs consistently', async () => {
    const tmpRoot = await fs.promises.mkdtemp(
      path.join(tmpDir, 'domain-sql-glob-consistency-'),
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
          (file === 'which' || file === 'where') && commandName === 'sqlfluff'
            ? 0
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

    try {
      process.chdir(tmpRoot);

      await fs.promises.mkdir(path.join(tmpRoot, 'db', 'views'), {
        recursive: true,
      });
      await fs.promises.writeFile(
        path.join(tmpRoot, 'db', 'views', 'a.sql'),
        'SELECT 1;\n',
        'utf8',
      );
      await fs.promises.writeFile(
        path.join(tmpRoot, 'db', 'views', 'b.sql'),
        'SELECT 1;\n',
        'utf8',
      );
      await fs.promises.mkdir(path.join(tmpRoot, 'db', 'ignored'), {
        recursive: true,
      });
      await fs.promises.writeFile(
        path.join(tmpRoot, 'db', 'ignored', 'c.sql'),
        'SELECT 1;\n',
        'utf8',
      );

      const sqlfluffConfigPath = path.join(tmpRoot, '.sqlfluff');
      await fs.promises.writeFile(
        sqlfluffConfigPath,
        '[sqlfluff]\ndialect = sqlite\n',
        'utf8',
      );
      const registry = createBuiltInDomainRegistry({
        prettierConfigPath: path.join(tmpRoot, 'prettier.config.js'),
      });

      const decisions = await evaluateLintDomains({
        registry,
        selectedDomains: new Set(['sql']),
        explicitlyRequestedDomains: new Set(['sql']),
        selectionSources: new Map([['sql', 'domain-flag']]),
        executionOrder: ['eslint', 'shell', 'markdown', 'svg', 'nix', 'sql'],
        context: {
          fix: false,
          logger: testLogger,
          isConfigValid: true,
          sqlPatterns: ['./db/views/*.sql'],
        },
      });

      const sqlDecision = decisions.find(
        (decision) => decision.domain === 'sql',
      );
      const matchedFiles = (sqlDecision?.detection?.matchedFiles ?? []).map(
        (p) => p.split(path.sep).join(path.posix.sep),
      );

      expect(sqlDecision?.plannedAction).toBe('run');
      expect(matchedFiles).toEqual(
        expect.arrayContaining(['db/views/a.sql', 'db/views/b.sql']),
      );
      expect(matchedFiles).not.toContain('db/ignored/c.sql');

      const hadFailure = await runLintDomains({
        registry,
        selectedDomains: new Set(['sql']),
        explicitlyRequestedDomains: new Set(['sql']),
        selectionSources: new Map([['sql', 'domain-flag']]),
        executionOrder: ['eslint', 'shell', 'markdown', 'svg', 'nix', 'sql'],
        context: {
          fix: false,
          logger: testLogger,
          isConfigValid: true,
          sqlPatterns: ['./db/views/*.sql'],
        },
      });

      expect(hadFailure).toBe(false);
      const sqlfluffCall = execFileSyncMock.mock.calls.find(
        ([file]) => file === 'sqlfluff',
      );
      const sqlfluffArgs = sqlfluffCall?.[1] as string[] | undefined;
      const normalizedSqlfluffArgs = (sqlfluffArgs ?? []).map((arg) =>
        arg.split(path.sep).join(path.posix.sep),
      );
      expect(normalizedSqlfluffArgs).toEqual([
        'lint',
        'db/views/a.sql',
        'db/views/b.sql',
      ]);
      expect(normalizedSqlfluffArgs).not.toContain('--config');
      expect(sqlfluffCall?.[2]).toEqual(
        expect.objectContaining({ cwd: tmpRoot }),
      );
      await expect(
        fs.promises.readFile(sqlfluffConfigPath, 'utf8'),
      ).resolves.toBe('[sqlfluff]\ndialect = sqlite\n');
    } finally {
      spawnSyncMock.mockRestore();
      execFileSyncMock.mockRestore();
      process.chdir(previousCwd);
      await fs.promises.rm(tmpRoot, { recursive: true, force: true });
    }
  });
});
