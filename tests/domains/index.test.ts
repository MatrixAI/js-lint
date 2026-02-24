import path from 'node:path';
import fs from 'node:fs';
import childProcess from 'node:child_process';
import Logger, { LogLevel } from '@matrixai/logger';
import { jest } from '@jest/globals';
import {
  createLintDomainRegistry,
  runLintDomains,
  evaluateLintDomains,
  listLintDomains,
  resolveDomainSelection,
  createBuiltInDomainRegistry,
  DEFAULT_NIXFMT_SEARCH_PATTERNS,
  type LintDomainPlugin,
} from '#domains.js';
import ESLintDomainPlugin from '#eslint/ESLintDomainPlugin.js';
import ShellDomainPlugin from '#shell/ShellDomainPlugin.js';
import MarkdownDomainPlugin from '#markdown/MarkdownDomainPlugin.js';
import NixDomainPlugin from '#nix/NixDomainPlugin.js';
import { buildPatterns } from '#eslint/utils.js';

const testLogger = new Logger('matrixai-lint-test', LogLevel.INFO, []);

describe('domain engine', () => {
  test('runs selected domains in declared order and aggregates failures', async () => {
    const executionTrace: string[] = [];
    const registry = createLintDomainRegistry([
      {
        domain: 'shell',
        description: 'shell test plugin',
        detect: () => ({
          relevant: true,
          available: true,
          availabilityKind: 'optional',
        }),
        run: () => {
          executionTrace.push('shell');
          return { hadFailure: false };
        },
      },
      {
        domain: 'eslint',
        description: 'eslint test plugin',
        detect: () => ({
          relevant: true,
          available: true,
          availabilityKind: 'required',
        }),
        run: () => {
          executionTrace.push('eslint');
          return { hadFailure: true };
        },
      },
      {
        domain: 'markdown',
        description: 'markdown test plugin',
        detect: () => ({
          relevant: true,
          available: true,
          availabilityKind: 'required',
        }),
        run: () => {
          executionTrace.push('markdown');
          return { hadFailure: false };
        },
      },
      {
        domain: 'nix',
        description: 'nix test plugin',
        detect: () => ({
          relevant: true,
          available: true,
          availabilityKind: 'optional',
        }),
        run: () => {
          executionTrace.push('nix');
          return { hadFailure: false };
        },
      },
    ] satisfies readonly LintDomainPlugin[]);

    const hadFailure = await runLintDomains({
      registry,
      selectedDomains: new Set(['eslint', 'markdown']),
      explicitlyRequestedDomains: new Set<never>(),
      executionOrder: ['eslint', 'shell', 'markdown', 'nix'],
      context: {
        fix: false,
        logger: testLogger,
        isConfigValid: true,
      },
    });

    expect(executionTrace).toStrictEqual(['eslint', 'markdown']);
    expect(hadFailure).toBe(true);
  });

  test('rejects duplicate domain registration', () => {
    expect(() =>
      createLintDomainRegistry([
        {
          domain: 'eslint',
          description: 'eslint test plugin',
          detect: () => ({
            relevant: true,
            available: true,
            availabilityKind: 'required',
          }),
          run: () => ({ hadFailure: false }),
        },
        {
          domain: 'eslint',
          description: 'eslint duplicate test plugin',
          detect: () => ({
            relevant: true,
            available: true,
            availabilityKind: 'required',
          }),
          run: () => ({ hadFailure: false }),
        },
      ] satisfies readonly LintDomainPlugin[]),
    ).toThrow('Duplicate lint domain plugin registration: eslint');
  });

  test('auto selected optional missing tool skips non-fatal', async () => {
    const registry = createLintDomainRegistry([
      {
        domain: 'shell',
        description: 'shell test plugin',
        detect: () => ({
          relevant: true,
          available: false,
          availabilityKind: 'optional',
          unavailableReason: 'shellcheck not found in environment.',
        }),
        run: () => ({ hadFailure: true }),
      },
    ] satisfies readonly LintDomainPlugin[]);

    const hadFailure = await runLintDomains({
      registry,
      selectedDomains: new Set(['shell']),
      explicitlyRequestedDomains: new Set<never>(),
      executionOrder: ['shell'],
      context: {
        fix: false,
        logger: testLogger,
        isConfigValid: true,
      },
    });

    expect(hadFailure).toBe(false);
  });

  test('explicit selected optional missing tool fails deterministically', async () => {
    const registry = createLintDomainRegistry([
      {
        domain: 'shell',
        description: 'shell test plugin',
        detect: () => ({
          relevant: true,
          available: false,
          availabilityKind: 'optional',
          unavailableReason: 'shellcheck not found in environment.',
        }),
        run: () => ({ hadFailure: false }),
      },
    ] satisfies readonly LintDomainPlugin[]);

    const hadFailure = await runLintDomains({
      registry,
      selectedDomains: new Set(['shell']),
      explicitlyRequestedDomains: new Set(['shell']),
      executionOrder: ['shell'],
      context: {
        fix: false,
        logger: testLogger,
        isConfigValid: true,
      },
    });

    expect(hadFailure).toBe(true);
  });

  test('explicit selected domain with no matched files is non-fatal no-op', async () => {
    const registry = createLintDomainRegistry([
      {
        domain: 'shell',
        description: 'shell test plugin',
        detect: () => ({
          relevant: false,
          available: true,
          availabilityKind: 'optional',
          relevanceReason: 'No shell script files matched in effective scope.',
        }),
        run: () => ({ hadFailure: true }),
      },
    ] satisfies readonly LintDomainPlugin[]);

    const hadFailure = await runLintDomains({
      registry,
      selectedDomains: new Set(['shell']),
      explicitlyRequestedDomains: new Set(['shell']),
      executionOrder: ['shell'],
      context: {
        fix: false,
        logger: testLogger,
        isConfigValid: true,
      },
    });

    expect(hadFailure).toBe(false);
  });

  test('auto selected required missing tool fails deterministically', async () => {
    const registry = createLintDomainRegistry([
      {
        domain: 'eslint',
        description: 'eslint test plugin',
        detect: () => ({
          relevant: true,
          available: false,
          availabilityKind: 'required',
          unavailableReason: 'ESLint runtime not available.',
        }),
        run: () => ({ hadFailure: false }),
      },
    ] satisfies readonly LintDomainPlugin[]);

    const hadFailure = await runLintDomains({
      registry,
      selectedDomains: new Set(['eslint']),
      explicitlyRequestedDomains: new Set<never>(),
      executionOrder: ['eslint'],
      context: {
        fix: false,
        logger: testLogger,
        isConfigValid: true,
      },
    });

    expect(hadFailure).toBe(true);
  });

  test('evaluate produces explainable decisions without duplicate detection logic', async () => {
    const registry = createLintDomainRegistry([
      {
        domain: 'eslint',
        description: 'eslint test plugin',
        detect: () => ({
          relevant: true,
          available: true,
          availabilityKind: 'required',
        }),
        run: () => ({ hadFailure: false }),
      },
      {
        domain: 'shell',
        description: 'shell test plugin',
        detect: () => ({
          relevant: true,
          available: false,
          availabilityKind: 'optional',
          unavailableReason: 'shellcheck not found in environment.',
        }),
        run: () => ({ hadFailure: false }),
      },
      {
        domain: 'markdown',
        description: 'markdown test plugin',
        detect: () => ({
          relevant: false,
          available: true,
          availabilityKind: 'required',
          relevanceReason: 'No Markdown files matched in effective scope.',
        }),
        run: () => ({ hadFailure: false }),
      },
      {
        domain: 'nix',
        description: 'nix test plugin',
        detect: () => ({
          relevant: true,
          available: true,
          availabilityKind: 'optional',
        }),
        run: () => ({ hadFailure: false }),
      },
    ] satisfies readonly LintDomainPlugin[]);

    const decisions = await evaluateLintDomains({
      registry,
      selectedDomains: new Set(['eslint', 'shell']),
      explicitlyRequestedDomains: new Set(['shell']),
      selectionSources: new Map([
        ['eslint', 'default'],
        ['shell', 'domain-flag'],
      ]),
      executionOrder: ['eslint', 'shell', 'markdown', 'nix'],
      context: {
        fix: false,
        logger: testLogger,
        isConfigValid: true,
      },
    });

    expect(decisions).toHaveLength(4);
    expect(decisions[0]?.domain).toBe('eslint');
    expect(decisions[0]?.plannedAction).toBe('run');
    expect(decisions[1]?.domain).toBe('shell');
    expect(decisions[1]?.plannedAction).toBe('fail-unavailable');
    expect(decisions[1]?.selectionSource).toBe('domain-flag');
    expect(decisions[2]?.domain).toBe('markdown');
    expect(decisions[2]?.plannedAction).toBe('skip-unselected');
    expect(decisions[3]?.domain).toBe('nix');
    expect(decisions[3]?.plannedAction).toBe('skip-unselected');
  });

  test('list-domains reflects registry metadata in execution order', () => {
    const registry = createLintDomainRegistry([
      {
        domain: 'eslint',
        description: 'eslint test plugin',
        detect: () => ({
          relevant: true,
          available: true,
          availabilityKind: 'required',
        }),
        run: () => ({ hadFailure: false }),
      },
      {
        domain: 'shell',
        description: 'shell test plugin',
        detect: () => ({
          relevant: true,
          available: true,
          availabilityKind: 'optional',
        }),
        run: () => ({ hadFailure: false }),
      },
      {
        domain: 'markdown',
        description: 'markdown test plugin',
        detect: () => ({
          relevant: true,
          available: true,
          availabilityKind: 'required',
        }),
        run: () => ({ hadFailure: false }),
      },
      {
        domain: 'nix',
        description: 'nix test plugin',
        detect: () => ({
          relevant: true,
          available: true,
          availabilityKind: 'optional',
        }),
        run: () => ({ hadFailure: false }),
      },
    ] satisfies readonly LintDomainPlugin[]);

    const listed = listLintDomains({
      registry,
      executionOrder: ['eslint', 'shell', 'markdown', 'nix'],
    });

    expect(listed).toStrictEqual([
      { domain: 'eslint', description: 'eslint test plugin' },
      { domain: 'shell', description: 'shell test plugin' },
      { domain: 'markdown', description: 'markdown test plugin' },
      { domain: 'nix', description: 'nix test plugin' },
    ]);
  });

  test('built-in registry uses class-backed domain plugins', () => {
    const registry = createBuiltInDomainRegistry({
      prettierConfigPath: './src/configs/prettier.config.js',
    });

    expect(registry.get('eslint')).toBeInstanceOf(ESLintDomainPlugin);
    expect(registry.get('shell')).toBeInstanceOf(ShellDomainPlugin);
    expect(registry.get('markdown')).toBeInstanceOf(MarkdownDomainPlugin);
    expect(registry.get('nix')).toBeInstanceOf(NixDomainPlugin);
  });

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
        executionOrder: ['eslint', 'shell', 'markdown', 'nix'],
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

  test('markdown detection auto-includes root README.md and AGENTS.md', async () => {
    const tmpRoot = await fs.promises.mkdtemp(
      path.join(tmpDir, 'domain-markdown-default-roots-'),
    );

    const previousCwd = process.cwd();

    try {
      process.chdir(tmpRoot);

      await fs.promises.writeFile(
        path.join(tmpRoot, 'README.md'),
        '# readme\n',
        'utf8',
      );
      await fs.promises.writeFile(
        path.join(tmpRoot, 'AGENTS.md'),
        '# agents\n',
        'utf8',
      );

      const registry = createBuiltInDomainRegistry({
        prettierConfigPath: path.join(tmpRoot, 'prettier.config.js'),
      });

      const decisions = await evaluateLintDomains({
        registry,
        selectedDomains: new Set(['markdown']),
        explicitlyRequestedDomains: new Set(['markdown']),
        selectionSources: new Map([['markdown', 'domain-flag']]),
        executionOrder: ['eslint', 'shell', 'markdown', 'nix'],
        context: {
          fix: false,
          logger: testLogger,
          isConfigValid: true,
        },
      });

      const markdownDecision = decisions.find(
        (decision) => decision.domain === 'markdown',
      );
      const matchedFiles = (
        markdownDecision?.detection?.matchedFiles ?? []
      ).map((p) => p.split(path.sep).join(path.posix.sep));

      expect(markdownDecision?.plannedAction).toBe('run');
      expect(matchedFiles).toEqual(
        expect.arrayContaining(['README.md', 'AGENTS.md']),
      );
      expect(matchedFiles.filter((file) => file === 'README.md')).toHaveLength(
        1,
      );
      expect(matchedFiles.filter((file) => file === 'AGENTS.md')).toHaveLength(
        1,
      );
    } finally {
      process.chdir(previousCwd);
      await fs.promises.rm(tmpRoot, { recursive: true, force: true });
    }
  });

  test('markdown detection auto-includes AGENTS.md when README.md is absent', async () => {
    const tmpRoot = await fs.promises.mkdtemp(
      path.join(tmpDir, 'domain-markdown-agents-only-'),
    );

    const previousCwd = process.cwd();

    try {
      process.chdir(tmpRoot);

      await fs.promises.writeFile(
        path.join(tmpRoot, 'AGENTS.md'),
        '# agents\n',
        'utf8',
      );

      const registry = createBuiltInDomainRegistry({
        prettierConfigPath: path.join(tmpRoot, 'prettier.config.js'),
      });

      const decisions = await evaluateLintDomains({
        registry,
        selectedDomains: new Set(['markdown']),
        explicitlyRequestedDomains: new Set(['markdown']),
        selectionSources: new Map([['markdown', 'domain-flag']]),
        executionOrder: ['eslint', 'shell', 'markdown', 'nix'],
        context: {
          fix: false,
          logger: testLogger,
          isConfigValid: true,
        },
      });

      const markdownDecision = decisions.find(
        (decision) => decision.domain === 'markdown',
      );
      const matchedFiles = (
        markdownDecision?.detection?.matchedFiles ?? []
      ).map((p) => p.split(path.sep).join(path.posix.sep));

      expect(markdownDecision?.plannedAction).toBe('run');
      expect(matchedFiles).toContain('AGENTS.md');
      expect(matchedFiles).not.toContain('README.md');
    } finally {
      process.chdir(previousCwd);
      await fs.promises.rm(tmpRoot, { recursive: true, force: true });
    }
  });

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
        executionOrder: ['eslint', 'shell', 'markdown', 'nix'],
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
        executionOrder: ['eslint', 'shell', 'markdown', 'nix'],
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

  test('markdown detection and run resolve globs consistently from explicit patterns', async () => {
    const tmpRoot = await fs.promises.mkdtemp(
      path.join(tmpDir, 'domain-markdown-glob-consistency-'),
    );

    const previousCwd = process.cwd();
    const execFileSyncMock = jest
      .spyOn(childProcess, 'execFileSync')
      .mockImplementation(
        (_file: string, _args?: readonly string[] | undefined) =>
          Buffer.from(''),
      );

    try {
      process.chdir(tmpRoot);

      await fs.promises.mkdir(path.join(tmpRoot, 'docs', 'guides'), {
        recursive: true,
      });

      await fs.promises.writeFile(
        path.join(tmpRoot, 'docs', 'guides', 'a.md'),
        '# A\n',
        'utf8',
      );
      await fs.promises.writeFile(
        path.join(tmpRoot, 'docs', 'guides', 'b.mdx'),
        '# B\n',
        'utf8',
      );

      const registry = createBuiltInDomainRegistry({
        prettierConfigPath: path.join(tmpRoot, 'prettier.config.js'),
      });

      const decisions = await evaluateLintDomains({
        registry,
        selectedDomains: new Set(['markdown']),
        explicitlyRequestedDomains: new Set(['markdown']),
        selectionSources: new Map([['markdown', 'domain-flag']]),
        executionOrder: ['eslint', 'shell', 'markdown', 'nix'],
        context: {
          fix: false,
          logger: testLogger,
          isConfigValid: true,
          markdownPatterns: ['./docs/**/*.md*'],
        },
      });

      const markdownDecision = decisions.find(
        (decision) => decision.domain === 'markdown',
      );
      const matchedFiles = (
        markdownDecision?.detection?.matchedFiles ?? []
      ).map((p) => p.split(path.sep).join(path.posix.sep));

      expect(markdownDecision?.plannedAction).toBe('run');
      expect(matchedFiles).toEqual(
        expect.arrayContaining(['docs/guides/a.md', 'docs/guides/b.mdx']),
      );

      const hadFailure = await runLintDomains({
        registry,
        selectedDomains: new Set(['markdown']),
        explicitlyRequestedDomains: new Set(['markdown']),
        selectionSources: new Map([['markdown', 'domain-flag']]),
        executionOrder: ['eslint', 'shell', 'markdown', 'nix'],
        context: {
          fix: false,
          logger: testLogger,
          isConfigValid: true,
          markdownPatterns: ['./docs/**/*.md*'],
        },
      });

      expect(hadFailure).toBe(false);
      const prettierCall = execFileSyncMock.mock.calls.find(([file, args]) => {
        const argList = [...((args as readonly string[] | undefined) ?? [])];
        return (
          file === 'prettier' ||
          argList.some((arg) => /prettier\.cjs$/.test(arg))
        );
      });
      const prettierArgs = (prettierCall?.[1] as string[] | undefined) ?? [];
      const normalizedPrettierArgs = prettierArgs.map((arg) =>
        arg.split(path.sep).join(path.posix.sep),
      );
      expect(normalizedPrettierArgs).toEqual(
        expect.arrayContaining(['docs/guides/a.md', 'docs/guides/b.mdx']),
      );
      expect(
        normalizedPrettierArgs.filter((arg) => arg === 'docs/guides/a.md'),
      ).toHaveLength(1);
      expect(
        normalizedPrettierArgs.filter((arg) => arg === 'docs/guides/b.mdx'),
      ).toHaveLength(1);
    } finally {
      execFileSyncMock.mockRestore();
      process.chdir(previousCwd);
      await fs.promises.rm(tmpRoot, { recursive: true, force: true });
    }
  });

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
        executionOrder: ['eslint', 'shell', 'markdown', 'nix'],
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
        executionOrder: ['eslint', 'shell', 'markdown', 'nix'],
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
        executionOrder: ['eslint', 'shell', 'markdown', 'nix'],
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

  test('nix default search patterns are stable and explicit', () => {
    expect(DEFAULT_NIXFMT_SEARCH_PATTERNS).toStrictEqual([
      './flake.nix',
      './shell.nix',
      './default.nix',
      './nix/**/*.nix',
    ]);
  });
});

describe('domain selection', () => {
  test('auto mode with no explicit domain requests selects all domains', () => {
    const { selectedDomains, explicitlyRequestedDomains, selectionSources } =
      resolveDomainSelection({
        fix: false,
        userConfig: false,
      });

    expect([...selectedDomains].sort()).toStrictEqual([
      'eslint',
      'markdown',
      'nix',
      'shell',
    ]);
    expect([...explicitlyRequestedDomains]).toStrictEqual([]);
    expect(selectionSources.get('eslint')).toBe('default');
    expect(selectionSources.get('shell')).toBe('default');
    expect(selectionSources.get('markdown')).toBe('default');
    expect(selectionSources.get('nix')).toBe('default');
  });

  test('domain specific target flags imply explicit domain request', () => {
    const { selectedDomains, explicitlyRequestedDomains, selectionSources } =
      resolveDomainSelection({
        fix: false,
        userConfig: false,
        eslint: ['src/**/*.{ts,tsx}'],
      });

    expect([...selectedDomains]).toStrictEqual(['eslint']);
    expect([...explicitlyRequestedDomains]).toStrictEqual(['eslint']);
    expect(selectionSources.get('eslint')).toBe('target-flag');
  });

  test('markdown target flag implies explicit markdown domain request', () => {
    const { selectedDomains, explicitlyRequestedDomains, selectionSources } =
      resolveDomainSelection({
        fix: false,
        userConfig: false,
        markdown: ['standards', 'templates', 'README.md'],
      });

    expect([...selectedDomains]).toStrictEqual(['markdown']);
    expect([...explicitlyRequestedDomains]).toStrictEqual(['markdown']);
    expect(selectionSources.get('markdown')).toBe('target-flag');
  });

  test('domain flag remains authoritative over markdown target flag', () => {
    const { selectedDomains, explicitlyRequestedDomains, selectionSources } =
      resolveDomainSelection({
        fix: false,
        userConfig: false,
        domain: ['eslint'],
        markdown: ['standards'],
      });

    expect([...selectedDomains]).toStrictEqual(['eslint']);
    expect([...explicitlyRequestedDomains]).toStrictEqual(['eslint']);
    expect(selectionSources.get('eslint')).toBe('domain-flag');
    expect(selectionSources.has('markdown')).toBe(false);
  });

  test('nix target flag implies explicit nix domain request', () => {
    const { selectedDomains, explicitlyRequestedDomains, selectionSources } =
      resolveDomainSelection({
        fix: false,
        userConfig: false,
        nix: ['./nix/**/*.nix'],
      });

    expect([...selectedDomains]).toStrictEqual(['nix']);
    expect([...explicitlyRequestedDomains]).toStrictEqual(['nix']);
    expect(selectionSources.get('nix')).toBe('target-flag');
  });

  test('--domain keeps explicit domains and --skip-domain removes them', () => {
    const { selectedDomains, explicitlyRequestedDomains, selectionSources } =
      resolveDomainSelection({
        fix: false,
        userConfig: false,
        domain: ['eslint', 'shell'],
        skipDomain: ['shell'],
      });

    expect([...selectedDomains]).toStrictEqual(['eslint']);
    expect([...explicitlyRequestedDomains]).toStrictEqual(['eslint']);
    expect(selectionSources.get('eslint')).toBe('domain-flag');
    expect(selectionSources.has('shell')).toBe(false);
  });
});

describe('eslint target derivation', () => {
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
