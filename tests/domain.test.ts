import type { LintDomainPlugin } from '#domains.js';
import Logger, { LogLevel } from '@matrixai/logger';
import {
  createLintDomainRegistry,
  runLintDomains,
  evaluateLintDomains,
  listLintDomains,
  createBuiltInDomainRegistry,
} from '#domains.js';
import ESLintDomainPlugin from '#eslint/ESLintDomainPlugin.js';
import ShellDomainPlugin from '#shell/ShellDomainPlugin.js';
import MarkdownDomainPlugin from '#markdown/MarkdownDomainPlugin.js';
import SvgDomainPlugin from '#svg/SvgDomainPlugin.js';
import NixDomainPlugin from '#nix/NixDomainPlugin.js';
import SqlDomainPlugin from '#sql/SqlDomainPlugin.js';

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
        domain: 'svg',
        description: 'svg test plugin',
        detect: () => ({
          relevant: true,
          available: true,
          availabilityKind: 'required',
        }),
        run: () => {
          executionTrace.push('svg');
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
      {
        domain: 'sql',
        description: 'sql test plugin',
        detect: () => ({
          relevant: true,
          available: true,
          availabilityKind: 'optional',
        }),
        run: () => {
          executionTrace.push('sql');
          return { hadFailure: false };
        },
      },
    ] satisfies readonly LintDomainPlugin[]);

    const hadFailure = await runLintDomains({
      registry,
      selectedDomains: new Set(['eslint', 'markdown']),
      explicitlyRequestedDomains: new Set<never>(),
      executionOrder: ['eslint', 'shell', 'markdown', 'svg', 'nix', 'sql'],
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
        domain: 'svg',
        description: 'svg test plugin',
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
      {
        domain: 'sql',
        description: 'sql test plugin',
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
      executionOrder: ['eslint', 'shell', 'markdown', 'svg', 'nix', 'sql'],
      context: {
        fix: false,
        logger: testLogger,
        isConfigValid: true,
      },
    });

    expect(decisions).toHaveLength(6);
    expect(decisions[0]?.domain).toBe('eslint');
    expect(decisions[0]?.plannedAction).toBe('run');
    expect(decisions[1]?.domain).toBe('shell');
    expect(decisions[1]?.plannedAction).toBe('fail-unavailable');
    expect(decisions[1]?.selectionSource).toBe('domain-flag');
    expect(decisions[2]?.domain).toBe('markdown');
    expect(decisions[2]?.plannedAction).toBe('skip-unselected');
    expect(decisions[3]?.domain).toBe('svg');
    expect(decisions[3]?.plannedAction).toBe('skip-unselected');
    expect(decisions[4]?.domain).toBe('nix');
    expect(decisions[4]?.plannedAction).toBe('skip-unselected');
    expect(decisions[5]?.domain).toBe('sql');
    expect(decisions[5]?.plannedAction).toBe('skip-unselected');
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
        domain: 'svg',
        description: 'svg test plugin',
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
      {
        domain: 'sql',
        description: 'sql test plugin',
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
      executionOrder: ['eslint', 'shell', 'markdown', 'svg', 'nix', 'sql'],
    });

    expect(listed).toStrictEqual([
      { domain: 'eslint', description: 'eslint test plugin' },
      { domain: 'shell', description: 'shell test plugin' },
      { domain: 'markdown', description: 'markdown test plugin' },
      { domain: 'svg', description: 'svg test plugin' },
      { domain: 'nix', description: 'nix test plugin' },
      { domain: 'sql', description: 'sql test plugin' },
    ]);
  });

  test('built-in registry uses class-backed domain plugins', () => {
    const registry = createBuiltInDomainRegistry({
      prettierConfigPath: './src/configs/prettier.config.js',
    });

    expect(registry.get('eslint')).toBeInstanceOf(ESLintDomainPlugin);
    expect(registry.get('shell')).toBeInstanceOf(ShellDomainPlugin);
    expect(registry.get('markdown')).toBeInstanceOf(MarkdownDomainPlugin);
    expect(registry.get('svg')).toBeInstanceOf(SvgDomainPlugin);
    expect(registry.get('nix')).toBeInstanceOf(NixDomainPlugin);
    expect(registry.get('sql')).toBeInstanceOf(SqlDomainPlugin);
  });
});
