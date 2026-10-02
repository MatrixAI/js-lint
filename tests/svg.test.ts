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

describe('svg domain', () => {
  test('svg detection defaults include source docs roots and skip asset roots', async () => {
    const tmpRoot = await fs.promises.mkdtemp(
      path.join(tmpDir, 'domain-svg-default-roots-'),
    );

    const previousCwd = process.cwd();

    try {
      process.chdir(tmpRoot);

      await fs.promises.mkdir(path.join(tmpRoot, 'public', 'icons'), {
        recursive: true,
      });
      await fs.promises.mkdir(path.join(tmpRoot, 'specs', 'diagrams'), {
        recursive: true,
      });
      await fs.promises.mkdir(path.join(tmpRoot, 'other'), {
        recursive: true,
      });

      await fs.promises.writeFile(
        path.join(tmpRoot, 'public', 'icons', 'logo.svg'),
        '<svg><path d="M0 0"/></svg>\n',
        'utf8',
      );
      await fs.promises.writeFile(
        path.join(tmpRoot, 'specs', 'diagrams', 'flow.svg'),
        '<svg><path d="M1 1"/></svg>\n',
        'utf8',
      );
      await fs.promises.writeFile(
        path.join(tmpRoot, 'other', 'skip.svg'),
        '<svg><path d="M0 0"/></svg>\n',
        'utf8',
      );

      const registry = createBuiltInDomainRegistry({
        prettierConfigPath: path.join(tmpRoot, 'prettier.config.js'),
      });

      const decisions = await evaluateLintDomains({
        registry,
        selectedDomains: new Set(['svg']),
        explicitlyRequestedDomains: new Set<never>(),
        selectionSources: new Map([['svg', 'default']]),
        executionOrder: ['eslint', 'shell', 'markdown', 'svg', 'nix', 'sql'],
        context: {
          fix: false,
          logger: testLogger,
          isConfigValid: true,
        },
      });

      const svgDecision = decisions.find(
        (decision) => decision.domain === 'svg',
      );
      const matchedFiles = (svgDecision?.detection?.matchedFiles ?? []).map(
        (p) => p.split(path.sep).join(path.posix.sep),
      );

      expect(svgDecision?.plannedAction).toBe('run');
      expect(matchedFiles).toContain('specs/diagrams/flow.svg');
      expect(matchedFiles).not.toContain('public/icons/logo.svg');
      expect(matchedFiles).not.toContain('other/skip.svg');
    } finally {
      process.chdir(previousCwd);
      await fs.promises.rm(tmpRoot, { recursive: true, force: true });
    }
  });

  test('svg detection and run resolve globs consistently from explicit patterns', async () => {
    const tmpRoot = await fs.promises.mkdtemp(
      path.join(tmpDir, 'domain-svg-glob-consistency-'),
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

      await fs.promises.mkdir(path.join(tmpRoot, 'assets', 'icons'), {
        recursive: true,
      });
      await fs.promises.mkdir(path.join(tmpRoot, 'assets', 'ignored'), {
        recursive: true,
      });

      await fs.promises.writeFile(
        path.join(tmpRoot, 'assets', 'icons', 'a.svg'),
        '<svg><path d="M0 0"/></svg>\n',
        'utf8',
      );
      await fs.promises.writeFile(
        path.join(tmpRoot, 'assets', 'icons', 'b.svg'),
        '<svg><path d="M1 1"/></svg>\n',
        'utf8',
      );
      await fs.promises.writeFile(
        path.join(tmpRoot, 'assets', 'ignored', 'c.svg'),
        '<svg><path d="M2 2"/></svg>\n',
        'utf8',
      );

      const registry = createBuiltInDomainRegistry({
        prettierConfigPath: path.join(tmpRoot, 'prettier.config.js'),
      });

      const decisions = await evaluateLintDomains({
        registry,
        selectedDomains: new Set(['svg']),
        explicitlyRequestedDomains: new Set(['svg']),
        selectionSources: new Map([['svg', 'domain-flag']]),
        executionOrder: ['eslint', 'shell', 'markdown', 'svg', 'nix', 'sql'],
        context: {
          fix: true,
          logger: testLogger,
          isConfigValid: true,
          svgPatterns: ['./assets/icons/*.svg'],
        },
      });

      const svgDecision = decisions.find(
        (decision) => decision.domain === 'svg',
      );
      const matchedFiles = (svgDecision?.detection?.matchedFiles ?? []).map(
        (p) => p.split(path.sep).join(path.posix.sep),
      );

      expect(svgDecision?.plannedAction).toBe('run');
      expect(matchedFiles).toEqual(
        expect.arrayContaining(['assets/icons/a.svg', 'assets/icons/b.svg']),
      );
      expect(matchedFiles).not.toContain('assets/ignored/c.svg');

      const hadFailure = await runLintDomains({
        registry,
        selectedDomains: new Set(['svg']),
        explicitlyRequestedDomains: new Set(['svg']),
        selectionSources: new Map([['svg', 'domain-flag']]),
        executionOrder: ['eslint', 'shell', 'markdown', 'svg', 'nix', 'sql'],
        context: {
          fix: true,
          logger: testLogger,
          isConfigValid: true,
          svgPatterns: ['./assets/icons/*.svg'],
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
        expect.arrayContaining([
          '--parser',
          'html',
          '--write',
          'assets/icons/a.svg',
          'assets/icons/b.svg',
        ]),
      );
      expect(
        normalizedPrettierArgs.filter((arg) => arg === 'assets/icons/a.svg'),
      ).toHaveLength(1);
      expect(
        normalizedPrettierArgs.filter((arg) => arg === 'assets/icons/b.svg'),
      ).toHaveLength(1);
      expect(normalizedPrettierArgs).not.toContain('assets/ignored/c.svg');
    } finally {
      execFileSyncMock.mockRestore();
      process.chdir(previousCwd);
      await fs.promises.rm(tmpRoot, { recursive: true, force: true });
    }
  });
});
