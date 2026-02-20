import path from 'node:path';
import fs from 'node:fs';
import Logger, { LogLevel } from '@matrixai/logger';
import {
  createLintDomainRegistry,
  runLintDomains,
  evaluateLintDomains,
  listLintDomains,
  resolveDomainSelection,
  createBuiltInDomainRegistry,
  type LintDomainPlugin,
} from '#domains/index.js';
import * as utils from '#utils.js';

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
    ] satisfies readonly LintDomainPlugin[]);

    const hadFailure = await runLintDomains({
      registry,
      selectedDomains: new Set(['eslint', 'markdown']),
      explicitlyRequestedDomains: new Set<never>(),
      executionOrder: ['eslint', 'shell', 'markdown'],
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
    ] satisfies readonly LintDomainPlugin[]);

    const decisions = await evaluateLintDomains({
      registry,
      selectedDomains: new Set(['eslint', 'shell']),
      explicitlyRequestedDomains: new Set(['shell']),
      selectionSources: new Map([
        ['eslint', 'default'],
        ['shell', 'domain-flag'],
      ]),
      executionOrder: ['eslint', 'shell', 'markdown'],
      context: {
        fix: false,
        logger: testLogger,
        isConfigValid: true,
      },
    });

    expect(decisions).toHaveLength(3);
    expect(decisions[0]?.domain).toBe('eslint');
    expect(decisions[0]?.plannedAction).toBe('run');
    expect(decisions[1]?.domain).toBe('shell');
    expect(decisions[1]?.plannedAction).toBe('fail-unavailable');
    expect(decisions[1]?.selectionSource).toBe('domain-flag');
    expect(decisions[2]?.domain).toBe('markdown');
    expect(decisions[2]?.plannedAction).toBe('skip-unselected');
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
    ] satisfies readonly LintDomainPlugin[]);

    const listed = listLintDomains({
      registry,
      executionOrder: ['eslint', 'shell', 'markdown'],
    });

    expect(listed).toStrictEqual([
      { domain: 'eslint', description: 'eslint test plugin' },
      { domain: 'shell', description: 'shell test plugin' },
      { domain: 'markdown', description: 'markdown test plugin' },
    ]);
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
        executionOrder: ['eslint', 'shell', 'markdown'],
        context: {
          fix: false,
          logger: testLogger,
          isConfigValid: true,
        },
      });

      const eslintDecision = decisions.find(
        (decision) => decision.domain === 'eslint',
      );
      expect(eslintDecision?.detection?.matchedFiles).toEqual(
        expect.arrayContaining(['pkg-a/src/a.ts', 'pkg-b/src/b.ts']),
      );
      expect(eslintDecision?.plannedAction).toBe('run');
    } finally {
      process.chdir(previousCwd);
      await fs.promises.rm(tmpRoot, { recursive: true, force: true });
    }
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
      'shell',
    ]);
    expect([...explicitlyRequestedDomains]).toStrictEqual([]);
    expect(selectionSources.get('eslint')).toBe('default');
    expect(selectionSources.get('shell')).toBe('default');
    expect(selectionSources.get('markdown')).toBe('default');
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

      const patterns = utils.buildPatterns(
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

      const patterns = utils.buildPatterns(
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
