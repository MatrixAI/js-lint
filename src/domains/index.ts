import type { LintDomain, CLIOptions } from '../types.js';
import {
  createLintDomainRegistry,
  listLintDomains,
  evaluateLintDomains,
  runLintDomainDecisions,
  runLintDomains,
  type LintDomainPlugin,
  type LintDomainPluginResult,
  type LintDomainDecision,
  type LintDomainEngineContext,
  type LintDomainSelectionSource,
} from './engine.js';
import { createESLintDomainPlugin } from './eslint.js';
import { createShellDomainPlugin } from './shell.js';
import { createMarkdownDomainPlugin } from './markdown.js';

const LINT_DOMAINS: LintDomain[] = ['eslint', 'shell', 'markdown'];

const DEFAULT_SHELLCHECK_SEARCH_ROOTS = ['./src', './scripts', './tests'];

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
  const explicitlyRequestedDomains = new Set<LintDomain>(domainFlags);
  const selectionSources = new Map<LintDomain, LintDomainSelectionSource>();

  if (hasExplicitESLintTargets) {
    explicitlyRequestedDomains.add('eslint');
  }
  if (hasExplicitShellTargets) {
    explicitlyRequestedDomains.add('shell');
  }

  let selectedDomains: Set<LintDomain>;

  if (domainFlags.length > 0) {
    selectedDomains = new Set<LintDomain>(domainFlags);
    for (const domain of domainFlags) {
      selectionSources.set(domain, 'domain-flag');
    }
  } else if (
    !hasDomainSelectors &&
    (hasExplicitESLintTargets || hasExplicitShellTargets)
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
}: {
  prettierConfigPath: string;
}): Map<LintDomain, LintDomainPlugin> {
  return createLintDomainRegistry([
    createESLintDomainPlugin(),
    createShellDomainPlugin({
      defaultSearchRoots: DEFAULT_SHELLCHECK_SEARCH_ROOTS,
    }),
    createMarkdownDomainPlugin({
      prettierConfigPath,
    }),
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
  resolveDomainSelection,
  createBuiltInDomainRegistry,
  createLintDomainRegistry,
  listLintDomains,
  evaluateLintDomains,
  runLintDomainDecisions,
  runLintDomains,
};
