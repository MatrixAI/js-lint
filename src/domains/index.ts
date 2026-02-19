import type { LintDomain, CLIOptions } from '../types.js';
import {
  createLintDomainRegistry,
  runLintDomains,
  type LintDomainPlugin,
  type LintDomainPluginResult,
  type LintDomainEngineContext,
} from './engine.js';
import { createESLintDomainPlugin } from './eslint.js';
import { createShellDomainPlugin } from './shell.js';
import { createMarkdownDomainPlugin } from './markdown.js';

const LINT_DOMAINS: LintDomain[] = ['eslint', 'shell', 'markdown'];

const DEFAULT_SHELLCHECK_SEARCH_ROOTS = ['./src', './scripts', './tests'];

function resolveDomainSelection(options: CLIOptions): {
  selectedDomains: Set<LintDomain>;
  explicitlyRequestedDomains: Set<LintDomain>;
} {
  const onlyDomains = options.only ?? [];
  const skipDomains = new Set(options.skip ?? []);
  const hasDomainSelectors = onlyDomains.length > 0 || skipDomains.size > 0;
  const hasExplicitESLintTargets = (options.eslint?.length ?? 0) > 0;
  const hasExplicitShellTargets = (options.shell?.length ?? 0) > 0;
  const explicitlyRequestedDomains = new Set<LintDomain>(onlyDomains);
  if (hasExplicitESLintTargets) {
    explicitlyRequestedDomains.add('eslint');
  }
  if (hasExplicitShellTargets) {
    explicitlyRequestedDomains.add('shell');
  }

  let selectedDomains: Set<LintDomain>;

  if (onlyDomains.length > 0) {
    selectedDomains = new Set<LintDomain>(onlyDomains);
  } else if (
    !hasDomainSelectors &&
    (hasExplicitESLintTargets || hasExplicitShellTargets)
  ) {
    selectedDomains = new Set<LintDomain>();
    if (hasExplicitESLintTargets) selectedDomains.add('eslint');
    if (hasExplicitShellTargets) selectedDomains.add('shell');
  } else {
    selectedDomains = new Set<LintDomain>(LINT_DOMAINS);
  }

  for (const domain of skipDomains) {
    selectedDomains.delete(domain);
  }

  for (const domain of [...explicitlyRequestedDomains]) {
    if (!selectedDomains.has(domain)) {
      explicitlyRequestedDomains.delete(domain);
    }
  }

  return { selectedDomains, explicitlyRequestedDomains };
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
  LintDomainEngineContext,
  LintDomainPlugin,
  LintDomainPluginResult,
};
export {
  LINT_DOMAINS,
  DEFAULT_SHELLCHECK_SEARCH_ROOTS,
  resolveDomainSelection,
  createBuiltInDomainRegistry,
  createLintDomainRegistry,
  runLintDomains,
};
