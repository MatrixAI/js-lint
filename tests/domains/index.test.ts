import {
  createLintDomainRegistry,
  runLintDomains,
  resolveDomainSelection,
  type LintDomainPlugin,
} from '#domains/index.js';

describe('domain engine', () => {
  test('runs selected domains in declared order and aggregates failures', async () => {
    const executionTrace: string[] = [];
    const registry = createLintDomainRegistry([
      {
        domain: 'shell',
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
          detect: () => ({
            relevant: true,
            available: true,
            availabilityKind: 'required',
          }),
          run: () => ({ hadFailure: false }),
        },
        {
          domain: 'eslint',
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
        isConfigValid: true,
      },
    });

    expect(hadFailure).toBe(false);
  });

  test('explicit selected optional missing tool fails deterministically', async () => {
    const registry = createLintDomainRegistry([
      {
        domain: 'shell',
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
        isConfigValid: true,
      },
    });

    expect(hadFailure).toBe(true);
  });

  test('explicit selected domain with no matched files is non-fatal no-op', async () => {
    const registry = createLintDomainRegistry([
      {
        domain: 'shell',
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
        isConfigValid: true,
      },
    });

    expect(hadFailure).toBe(false);
  });

  test('auto selected required missing tool fails deterministically', async () => {
    const registry = createLintDomainRegistry([
      {
        domain: 'eslint',
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
        isConfigValid: true,
      },
    });

    expect(hadFailure).toBe(true);
  });
});

describe('domain selection', () => {
  test('auto mode with no explicit domain requests selects all domains', () => {
    const { selectedDomains, explicitlyRequestedDomains } =
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
  });

  test('domain specific target flags imply explicit domain request', () => {
    const { selectedDomains, explicitlyRequestedDomains } =
      resolveDomainSelection({
        fix: false,
        userConfig: false,
        eslint: ['src/**/*.{ts,tsx}'],
      });

    expect([...selectedDomains]).toStrictEqual(['eslint']);
    expect([...explicitlyRequestedDomains]).toStrictEqual(['eslint']);
  });

  test('--only keeps explicit domains and --skip removes them', () => {
    const { selectedDomains, explicitlyRequestedDomains } =
      resolveDomainSelection({
        fix: false,
        userConfig: false,
        only: ['eslint', 'shell'],
        skip: ['shell'],
      });

    expect([...selectedDomains]).toStrictEqual(['eslint']);
    expect([...explicitlyRequestedDomains]).toStrictEqual(['eslint']);
  });
});
