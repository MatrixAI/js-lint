import type {
  MatrixAILintCfgDomainScope,
  MatrixAILintCfgSource,
  MatrixAILintCfgResolved,
  RawMatrixCfg,
  TailwindMode,
} from './types.js';
import type { ParseError } from 'jsonc-parser';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parse } from 'jsonc-parser';

const MATRIXAI_LINT_CONFIG_FILENAME = 'matrixai-lint-config.json';
const TAILWIND_CONFIG_FILENAMES = [
  'tailwind.config.js',
  'tailwind.config.cjs',
  'tailwind.config.mjs',
  'tailwind.config.ts',
  'tailwind.config.cts',
  'tailwind.config.mts',
] as const;
const PACKAGE_DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toStringArray(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }

  return [];
}

function stripLeadingDotSlash(value: string): string {
  return value.replace(/^\.\//, '');
}

function dedupeAndSort(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function sanitizeTailwindMode(value: unknown): TailwindMode {
  if (value == null) {
    return 'auto';
  }

  if (value === 'auto' || value === 'enabled' || value === 'disabled') {
    return value;
  }

  throw new Error(
    '[matrixai-lint]  ✖  domains.eslint.tailwind must be "auto", "enabled", or "disabled".',
  );
}

function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function isTailwindPackage(packageName: string): boolean {
  return (
    packageName === 'tailwindcss' || packageName.startsWith('@tailwindcss/')
  );
}

function packageDeclaresTailwind(root: string): boolean {
  const packagePath = path.join(root, 'package.json');
  let packageJson: unknown;

  try {
    packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  } catch {
    return false;
  }

  if (!isRecord(packageJson)) {
    return false;
  }

  const packageRecord = packageJson;

  return PACKAGE_DEPENDENCY_FIELDS.some((field) => {
    const dependencies = packageRecord[field];
    return (
      isRecord(dependencies) &&
      Object.keys(dependencies).some((packageName) =>
        isTailwindPackage(packageName),
      )
    );
  });
}

function rootHasTailwindConfig(root: string): boolean {
  return TAILWIND_CONFIG_FILENAMES.some((filename) =>
    isFile(path.join(root, filename)),
  );
}

function resolveTailwindEnabled(mode: TailwindMode, root: string): boolean {
  if (mode === 'enabled') {
    return true;
  }

  if (mode === 'disabled') {
    return false;
  }

  return packageDeclaresTailwind(root) || rootHasTailwindConfig(root);
}

function isReadableTsconfigPath(tsconfigPath: string): boolean {
  let stats: fs.Stats;
  try {
    stats = fs.statSync(tsconfigPath);
  } catch {
    return false;
  }

  if (!stats.isFile()) {
    return false;
  }

  try {
    const errors: ParseError[] = [];
    parse(fs.readFileSync(tsconfigPath, 'utf8'), errors, {
      allowTrailingComma: true,
    });
    return errors.length === 0;
  } catch {
    return false;
  }
}

function sanitizeTsconfigPaths(rawValue: unknown, root: string): string[] {
  return dedupeAndSort(
    toStringArray(rawValue)
      .map((tsconfigPath) => path.resolve(root, tsconfigPath))
      .filter((tsconfigPath) => isReadableTsconfigPath(tsconfigPath)),
  );
}

function sanitizeForceInclude(rawValue: unknown): string[] {
  return dedupeAndSort(
    toStringArray(rawValue)
      .map((glob) => stripLeadingDotSlash(glob))
      .filter((glob) => glob.length > 0),
  );
}

function sanitizeTargets(
  rawValue: unknown,
  root: string,
  repoRoot: string,
): string[] {
  return dedupeAndSort(
    toStringArray(rawValue)
      .map((target) => target.trim())
      .filter((target) => target.length > 0)
      .map((target) => {
        const relativeTarget = path.relative(
          repoRoot,
          path.resolve(root, target),
        );
        return relativeTarget.length > 0
          ? relativeTarget.split(path.sep).join(path.posix.sep)
          : '.';
      }),
  );
}

function getRawDomain(
  domains: Record<string, unknown>,
  domain: string,
): Record<string, unknown> {
  const rawDomain = domains[domain];
  return isRecord(rawDomain) ? rawDomain : {};
}

function normalizeDomainScope(
  raw: Record<string, unknown>,
  root: string,
  repoRoot: string,
): MatrixAILintCfgDomainScope {
  const result: MatrixAILintCfgDomainScope = {
    targets: sanitizeTargets(raw.targets, root, repoRoot),
  };
  if (raw.enabled !== undefined) {
    if (typeof raw.enabled !== 'boolean') {
      throw new Error('Domain enabled must be a boolean.');
    }
    result.enabled = raw.enabled;
  }
  for (const key of [
    'replaceTargets',
    'extendTargets',
    'excludeTargets',
  ] as const) {
    if (raw[key] === undefined) continue;
    if (
      !Array.isArray(raw[key]) ||
      raw[key].some((value) => typeof value !== 'string')
    ) {
      throw new Error(`${key} must be an array of strings.`);
    }
    result[key] = sanitizeTargets(raw[key], root, repoRoot);
  }
  return result;
}

function normalizeLintConfig({
  rawConfig,
  source,
  repoRoot,
  configFilePath,
}: {
  rawConfig: RawMatrixCfg;
  source: MatrixAILintCfgSource;
  repoRoot: string;
  configFilePath: string;
}): MatrixAILintCfgResolved {
  const rawRoot =
    typeof rawConfig.root === 'string' && rawConfig.root.length > 0
      ? rawConfig.root
      : '.';
  const resolvedRoot = path.resolve(repoRoot, rawRoot);

  const rawDomains: Record<string, unknown> = isRecord(rawConfig.domains)
    ? rawConfig.domains
    : {};
  const rawEslintDomain = getRawDomain(rawDomains, 'eslint');
  const rawShellDomain = getRawDomain(rawDomains, 'shell');
  const rawMarkdownDomain = getRawDomain(rawDomains, 'markdown');
  const rawSvgDomain = getRawDomain(rawDomains, 'svg');
  const rawNixDomain = getRawDomain(rawDomains, 'nix');
  const rawSqlDomain = getRawDomain(rawDomains, 'sql');
  const rawRustDomain = getRawDomain(rawDomains, 'rust');
  if (
    rawRustDomain.clippy !== undefined &&
    typeof rawRustDomain.clippy !== 'boolean'
  ) {
    throw new Error('Rust clippy must be a boolean.');
  }
  if (
    rawRustDomain.cargoArgs !== undefined &&
    (!Array.isArray(rawRustDomain.cargoArgs) ||
      rawRustDomain.cargoArgs.some((arg) => typeof arg !== 'string'))
  ) {
    throw new Error('Rust cargoArgs must be an array of strings.');
  }

  let tsconfigPaths = sanitizeTsconfigPaths(
    rawEslintDomain.tsconfigPaths,
    resolvedRoot,
  );
  const eslintTargets = sanitizeTargets(
    rawEslintDomain.targets,
    resolvedRoot,
    repoRoot,
  );
  const forceInclude = sanitizeForceInclude(rawEslintDomain.forceInclude);
  const tailwind = sanitizeTailwindMode(rawEslintDomain.tailwind);
  const tailwindEnabled = resolveTailwindEnabled(tailwind, resolvedRoot);
  const shellTargets = sanitizeTargets(
    rawShellDomain.targets,
    resolvedRoot,
    repoRoot,
  );
  const markdownTargets = sanitizeTargets(
    rawMarkdownDomain.targets,
    resolvedRoot,
    repoRoot,
  );
  const svgTargets = sanitizeTargets(
    rawSvgDomain.targets,
    resolvedRoot,
    repoRoot,
  );
  const nixTargets = sanitizeTargets(
    rawNixDomain.targets,
    resolvedRoot,
    repoRoot,
  );
  const sqlTargets = sanitizeTargets(
    rawSqlDomain.targets,
    resolvedRoot,
    repoRoot,
  );

  if (tsconfigPaths.length === 0) {
    const rootTsconfigPath = path.join(resolvedRoot, 'tsconfig.json');
    if (isReadableTsconfigPath(rootTsconfigPath)) {
      tsconfigPaths.push(rootTsconfigPath);
    }
  }

  tsconfigPaths = dedupeAndSort(tsconfigPaths);

  return {
    version: 2,
    root: resolvedRoot,
    source,
    configFilePath,
    domains: {
      eslint: {
        ...normalizeDomainScope(rawEslintDomain, resolvedRoot, repoRoot),
        targets: eslintTargets,
        tsconfigPaths,
        forceInclude,
        tailwind,
        tailwindEnabled,
      },
      shell: {
        ...normalizeDomainScope(rawShellDomain, resolvedRoot, repoRoot),
        targets: shellTargets,
      },
      markdown: {
        ...normalizeDomainScope(rawMarkdownDomain, resolvedRoot, repoRoot),
        targets: markdownTargets,
      },
      svg: {
        ...normalizeDomainScope(rawSvgDomain, resolvedRoot, repoRoot),
        targets: svgTargets,
      },
      nix: {
        ...normalizeDomainScope(rawNixDomain, resolvedRoot, repoRoot),
        targets: nixTargets,
      },
      sql: {
        ...normalizeDomainScope(rawSqlDomain, resolvedRoot, repoRoot),
        targets: sqlTargets,
      },
      rust: {
        ...normalizeDomainScope(rawRustDomain, resolvedRoot, repoRoot),
        clippy: rawRustDomain.clippy !== false,
        cargoArgs: (rawRustDomain.cargoArgs as string[] | undefined) ?? [],
      },
    },
  };
}

function parseLintConfig({
  rawConfig,
  repoRoot,
  configFilePath,
}: {
  rawConfig: unknown;
  repoRoot: string;
  configFilePath: string;
}): MatrixAILintCfgResolved {
  if (!isRecord(rawConfig)) {
    throw new Error(
      '[matrixai-lint]  ✖  matrixai-lint-config.json must contain a JSON object.',
    );
  }

  if (rawConfig.version !== 2) {
    throw new Error(
      '[matrixai-lint]  ✖  matrixai-lint-config.json must declare "version": 2.',
    );
  }

  return normalizeLintConfig({
    rawConfig: rawConfig as RawMatrixCfg,
    source: 'config',
    repoRoot,
    configFilePath,
  });
}

function resolveLintConfig(repoRoot = process.cwd()): MatrixAILintCfgResolved {
  const configFilePath = path.join(repoRoot, MATRIXAI_LINT_CONFIG_FILENAME);

  if (!fs.existsSync(configFilePath)) {
    return normalizeLintConfig({
      rawConfig: { version: 2 },
      source: 'default',
      repoRoot,
      configFilePath,
    });
  }

  let rawConfig: unknown = {};

  try {
    const text = fs.readFileSync(configFilePath, 'utf8').trim();
    rawConfig = text.length > 0 ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(
      `[matrixai-lint]  ✖  matrixai-lint-config.json has been provided but it is not valid JSON.\n ${String(error)}`,
    );
  }

  return parseLintConfig({
    rawConfig,
    repoRoot,
    configFilePath,
  });
}

export {
  MATRIXAI_LINT_CONFIG_FILENAME,
  TAILWIND_CONFIG_FILENAMES,
  normalizeLintConfig,
  parseLintConfig,
  resolveLintConfig,
};
