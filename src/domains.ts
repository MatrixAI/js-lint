import type { LintDomain, CLIOptions } from './types.js';
import type {
  LintDomainPlugin,
  LintDomainPluginResult,
  LintDomainDecision,
  LintDomainEngineContext,
  LintDomainSelectionSource,
} from './domainEngine.js';
import {
  createLintDomainRegistry,
  listLintDomains,
  evaluateLintDomains,
  runLintDomainDecisions,
  runLintDomains,
} from './domainEngine.js';
import {
  DEFAULT_SHELLCHECK_SEARCH_ROOTS,
  DEFAULT_NIXFMT_SEARCH_PATTERNS,
  DEFAULT_SVG_SEARCH_ROOTS,
  DEFAULT_SQLFLUFF_SEARCH_PATTERNS,
} from './constants.js';
import ESLintDomainPlugin from './eslint/ESLintDomainPlugin.js';
import ShellDomainPlugin from './shell/ShellDomainPlugin.js';
import MarkdownDomainPlugin from './markdown/MarkdownDomainPlugin.js';
import SvgDomainPlugin from './svg/SvgDomainPlugin.js';
import NixDomainPlugin from './nix/NixDomainPlugin.js';
import SqlDomainPlugin from './sql/SqlDomainPlugin.js';

const LINT_DOMAINS: LintDomain[] = [
  'eslint',
  'shell',
  'markdown',
  'svg',
  'nix',
  'sql',
];

function resolveDomainSelection(options: CLIOptions): {
  selectedDomains: Set<LintDomain>;
  explicitlyRequestedDomains: Set<LintDomain>;
  selectionSources: Map<LintDomain, LintDomainSelectionSource>;
} {
  const domainFlags = options.domain ?? [];
  const skipDomains = new Set<LintDomain>(options.skipDomain ?? []);
  const hasDomainSelectors = domainFlags.length > 0 || skipDomains.size > 0;
  const hasExplicitESLintTargets = (options.eslint?.length ?? 0) > 0;
  const hasExplicitShellTargets = (options.shell?.length ?? 0) > 0;
  const hasExplicitMarkdownTargets = (options.markdown?.length ?? 0) > 0;
  const hasExplicitSvgTargets = (options.svg?.length ?? 0) > 0;
  const hasExplicitNixTargets = (options.nix?.length ?? 0) > 0;
  const hasExplicitSqlTargets = (options.sql?.length ?? 0) > 0;
  const explicitlyRequestedDomains = new Set<LintDomain>(domainFlags);
  const selectionSources = new Map<LintDomain, LintDomainSelectionSource>();

  if (hasExplicitESLintTargets) {
    explicitlyRequestedDomains.add('eslint');
  }
  if (hasExplicitShellTargets) {
    explicitlyRequestedDomains.add('shell');
  }
  if (hasExplicitMarkdownTargets) {
    explicitlyRequestedDomains.add('markdown');
  }
  if (hasExplicitSvgTargets) {
    explicitlyRequestedDomains.add('svg');
  }
  if (hasExplicitNixTargets) {
    explicitlyRequestedDomains.add('nix');
  }
  if (hasExplicitSqlTargets) {
    explicitlyRequestedDomains.add('sql');
  }

  let selectedDomains: Set<LintDomain>;

  if (domainFlags.length > 0) {
    selectedDomains = new Set<LintDomain>(domainFlags);
    for (const domain of domainFlags) {
      selectionSources.set(domain, 'domain-flag');
    }
  } else if (
    !hasDomainSelectors &&
    (hasExplicitESLintTargets ||
      hasExplicitShellTargets ||
      hasExplicitMarkdownTargets ||
      hasExplicitSvgTargets ||
      hasExplicitNixTargets ||
      hasExplicitSqlTargets)
  ) {
    selectedDomains = new Set<LintDomain>();
    if (hasExplicitESLintTargets) {
      selectedDomains.add('eslint');
      selectionSources.set('eslint', 'target-flag');
    }
    if (hasExplicitShellTargets) {
      selectedDomains.add('shell');
      selectionSources.set('shell', 'target-flag');
    }
    if (hasExplicitMarkdownTargets) {
      selectedDomains.add('markdown');
      selectionSources.set('markdown', 'target-flag');
    }
    if (hasExplicitSvgTargets) {
      selectedDomains.add('svg');
      selectionSources.set('svg', 'target-flag');
    }
    if (hasExplicitNixTargets) {
      selectedDomains.add('nix');
      selectionSources.set('nix', 'target-flag');
    }
    if (hasExplicitSqlTargets) {
      selectedDomains.add('sql');
      selectionSources.set('sql', 'target-flag');
    }
  } else {
    selectedDomains = new Set<LintDomain>(LINT_DOMAINS);
    for (const domain of LINT_DOMAINS) {
      selectionSources.set(domain, 'default');
    }
  }

  for (const domain of skipDomains) {
    selectedDomains.delete(domain);
    selectionSources.delete(domain);
  }

  for (const domain of [...explicitlyRequestedDomains]) {
    if (!selectedDomains.has(domain)) {
      explicitlyRequestedDomains.delete(domain);
    }
  }

  return {
    selectedDomains,
    explicitlyRequestedDomains,
    selectionSources,
  };
}

function createBuiltInDomainRegistry({
  prettierConfigPath,
  sqlfluffConfigPath = './src/configs/sqlfluff.cfg',
}: {
  prettierConfigPath: string;
  sqlfluffConfigPath?: string;
}): Map<LintDomain, LintDomainPlugin> {
  return createLintDomainRegistry([
    new ESLintDomainPlugin(),
    new ShellDomainPlugin(DEFAULT_SHELLCHECK_SEARCH_ROOTS),
    new MarkdownDomainPlugin(prettierConfigPath),
    new SvgDomainPlugin(prettierConfigPath, DEFAULT_SVG_SEARCH_ROOTS),
    new NixDomainPlugin(DEFAULT_NIXFMT_SEARCH_PATTERNS),
    new SqlDomainPlugin(DEFAULT_SQLFLUFF_SEARCH_PATTERNS, sqlfluffConfigPath),
  ]);
}

export type {
  LintDomainDecision,
  LintDomainEngineContext,
  LintDomainPlugin,
  LintDomainPluginResult,
  LintDomainSelectionSource,
};
export {
  LINT_DOMAINS,
  DEFAULT_SHELLCHECK_SEARCH_ROOTS,
  DEFAULT_SVG_SEARCH_ROOTS,
  DEFAULT_NIXFMT_SEARCH_PATTERNS,
  DEFAULT_SQLFLUFF_SEARCH_PATTERNS,
  resolveDomainSelection,
  createBuiltInDomainRegistry,
  createLintDomainRegistry,
  listLintDomains,
  evaluateLintDomains,
  runLintDomainDecisions,
  runLintDomains,
};
