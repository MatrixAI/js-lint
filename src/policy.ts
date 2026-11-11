import type {
  CLIOptions,
  LintDomain,
  MatrixAILintCfgResolved,
} from './types.js';
import path from 'node:path';
import { minimatch } from 'minimatch';
import {
  DEFAULT_ESLINT_SEARCH_ROOTS,
  DEFAULT_SHELLCHECK_SEARCH_ROOTS,
  DEFAULT_MARKDOWN_SEARCH_ROOTS,
  DEFAULT_SVG_SEARCH_ROOTS,
  DEFAULT_NIXFMT_SEARCH_PATTERNS,
  DEFAULT_SQLFLUFF_SEARCH_PATTERNS,
  DEFAULT_RUST_SEARCH_PATTERNS,
} from './constants.js';
import ESLintScope from './eslint/ESLintScope.js';
import FileDiscovery from './FileDiscovery.js';

const DEFAULT_TARGETS: Record<LintDomain, readonly string[]> = {
  eslint: DEFAULT_ESLINT_SEARCH_ROOTS,
  shell: DEFAULT_SHELLCHECK_SEARCH_ROOTS,
  markdown: DEFAULT_MARKDOWN_SEARCH_ROOTS,
  svg: DEFAULT_SVG_SEARCH_ROOTS,
  nix: DEFAULT_NIXFMT_SEARCH_PATTERNS,
  sql: DEFAULT_SQLFLUFF_SEARCH_PATTERNS,
  rust: DEFAULT_RUST_SEARCH_PATTERNS,
};

const EXTENSIONS: Record<LintDomain, readonly string[]> = {
  eslint: [
    '.js',
    '.mjs',
    '.cjs',
    '.jsx',
    '.ts',
    '.tsx',
    '.mts',
    '.cts',
    '.json',
  ],
  shell: ['.sh'],
  markdown: ['.md', '.mdx'],
  svg: ['.svg'],
  nix: ['.nix'],
  sql: ['.sql'],
  rust: ['.rs'],
};

type DomainPolicy = {
  enabled: boolean;
  patterns: string[];
  exclusions: string[];
  files: string[];
  provenance: string[];
};

function parseTargetOperations(
  values: readonly string[] = [],
): Partial<Record<LintDomain, string[]>> {
  const result: Partial<Record<LintDomain, string[]>> = {};
  for (const value of values) {
    const separator = value.indexOf('=');
    const domain = value.slice(0, separator) as LintDomain;
    if (separator < 0 || !Object.hasOwn(DEFAULT_TARGETS, domain)) {
      throw new Error(`Expected domain=target, received: ${value}`);
    }
    const targets = result[domain] ?? [];
    const target = value.slice(separator + 1);
    if (target.length > 0) targets.push(target);
    result[domain] = targets;
  }
  return result;
}

function resolveExecutionPolicy(
  config: MatrixAILintCfgResolved,
  options: CLIOptions,
  selectedDomains: ReadonlySet<LintDomain>,
): Record<LintDomain, DomainPolicy> {
  const additions = parseTargetOperations(options.extendTarget);
  const replacements = parseTargetOperations(options.replaceTarget);
  const exclusions = parseTargetOperations(options.excludeTarget);
  const result = {} as Record<LintDomain, DomainPolicy>;
  for (const domain of Object.keys(DEFAULT_TARGETS) as LintDomain[]) {
    const scope = config.domains[domain];
    const provenance = ['defaults'];
    const cliTargets = options[domain];
    const explicitlyEnabled =
      options.domain?.includes(domain) === true ||
      (cliTargets?.length ?? 0) > 0 ||
      replacements[domain] !== undefined;
    const enabled =
      selectedDomains.has(domain) &&
      (scope.enabled !== false || explicitlyEnabled);
    let patterns = DEFAULT_TARGETS[domain].map((target) =>
      path
        .relative(process.cwd(), path.resolve(config.root, target))
        .split(path.sep)
        .join('/'),
    );
    if (
      enabled &&
      domain === 'eslint' &&
      config.domains.eslint.tsconfigPaths.length > 0
    ) {
      patterns = new ESLintScope().buildPatterns(
        config.domains.eslint.tsconfigPaths,
        config.domains.eslint.forceInclude,
        process.cwd(),
        config.root,
      ).files;
    }
    if (scope.targets.length > 0) {
      patterns = [...scope.targets];
      provenance.push('repository.targets');
    }
    if (scope.replaceTargets !== undefined) {
      patterns = [...scope.replaceTargets];
      provenance.push('repository.replaceTargets');
    }
    if (scope.extendTargets !== undefined) {
      patterns.push(...scope.extendTargets);
      provenance.push('repository.extendTargets');
    }
    if (cliTargets !== undefined && cliTargets.length > 0) {
      patterns = [...cliTargets];
      provenance.push('cli.targets');
    }
    if (replacements[domain] !== undefined) {
      patterns = [...replacements[domain]];
      provenance.push('cli.replaceTarget');
    }
    if (additions[domain] !== undefined) {
      patterns.push(...additions[domain]);
      provenance.push('cli.extendTarget');
    }
    const excluded = [
      ...(scope.excludeTargets ?? []),
      ...(exclusions[domain] ?? []),
    ];
    if (scope.enabled !== undefined) {
      provenance.push(`repository.enabled=${scope.enabled}`);
    }
    if (explicitlyEnabled) provenance.push('cli.enabled');
    const extensions =
      domain === 'eslint' && config.domains.eslint.tsconfigPaths.length === 0
        ? EXTENSIONS.eslint.filter((extension) => extension !== '.json')
        : EXTENSIONS[domain];
    const files = enabled
      ? new FileDiscovery()
          .resolveFilesFromPatterns(patterns, extensions)
          .filter(
            (file) =>
              !excluded.some(
                (pattern) =>
                  minimatch(file, pattern, { dot: true }) ||
                  minimatch(file, `${pattern}/**`, { dot: true }),
              ),
          )
      : [];
    result[domain] = {
      enabled,
      patterns: [...new Set(patterns)],
      exclusions: excluded,
      files,
      provenance,
    };
  }
  return result;
}

export type { DomainPolicy };
export { parseTargetOperations, resolveExecutionPolicy };
