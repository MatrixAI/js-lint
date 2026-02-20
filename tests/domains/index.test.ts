import Logger, { LogLevel } from '@matrixai/logger';
import {
  createLintDomainRegistry,
  runLintDomains,
  evaluateLintDomains,
  listLintDomains,
  resolveDomainSelection,
  type LintDomainPlugin,
} from '#domains/index.js';

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
