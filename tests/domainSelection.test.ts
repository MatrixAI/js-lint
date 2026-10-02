import { resolveDomainSelection } from '#domains.js';

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
      'sql',
      'svg',
    ]);
    expect([...explicitlyRequestedDomains]).toStrictEqual([]);
    expect(selectionSources.get('eslint')).toBe('default');
    expect(selectionSources.get('shell')).toBe('default');
    expect(selectionSources.get('markdown')).toBe('default');
    expect(selectionSources.get('svg')).toBe('default');
    expect(selectionSources.get('nix')).toBe('default');
    expect(selectionSources.get('sql')).toBe('default');
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

  test('svg target flag implies explicit svg domain request', () => {
    const { selectedDomains, explicitlyRequestedDomains, selectionSources } =
      resolveDomainSelection({
        fix: false,
        userConfig: false,
        svg: ['assets', 'public/logo.svg'],
      });

    expect([...selectedDomains]).toStrictEqual(['svg']);
    expect([...explicitlyRequestedDomains]).toStrictEqual(['svg']);
    expect(selectionSources.get('svg')).toBe('target-flag');
  });

  test('domain flag remains authoritative over target flags', () => {
    const { selectedDomains, explicitlyRequestedDomains, selectionSources } =
      resolveDomainSelection({
        fix: false,
        userConfig: false,
        domain: ['eslint'],
        markdown: ['standards'],
        svg: ['assets'],
      });

    expect([...selectedDomains]).toStrictEqual(['eslint']);
    expect([...explicitlyRequestedDomains]).toStrictEqual(['eslint']);
    expect(selectionSources.get('eslint')).toBe('domain-flag');
    expect(selectionSources.has('markdown')).toBe(false);
    expect(selectionSources.has('svg')).toBe(false);
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

  test('sql target flag implies explicit sql domain request', () => {
    const { selectedDomains, explicitlyRequestedDomains, selectionSources } =
      resolveDomainSelection({
        fix: false,
        userConfig: false,
        sql: ['./db/**/*.sql'],
      });

    expect([...selectedDomains]).toStrictEqual(['sql']);
    expect([...explicitlyRequestedDomains]).toStrictEqual(['sql']);
    expect(selectionSources.get('sql')).toBe('target-flag');
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
