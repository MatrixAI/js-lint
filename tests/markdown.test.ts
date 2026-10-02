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

describe('markdown domain', () => {
  test('markdown detection defaults include root files and specs', async () => {
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
      await fs.promises.mkdir(path.join(tmpRoot, 'specs'), {
        recursive: true,
      });
      await fs.promises.writeFile(
        path.join(tmpRoot, 'specs', 'protocol.md'),
        '# protocol\n',
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
        executionOrder: ['eslint', 'shell', 'markdown', 'svg', 'nix', 'sql'],
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
        expect.arrayContaining(['README.md', 'AGENTS.md', 'specs/protocol.md']),
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
        executionOrder: ['eslint', 'shell', 'markdown', 'svg', 'nix', 'sql'],
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
        executionOrder: ['eslint', 'shell', 'markdown', 'svg', 'nix', 'sql'],
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
        executionOrder: ['eslint', 'shell', 'markdown', 'svg', 'nix', 'sql'],
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
});
