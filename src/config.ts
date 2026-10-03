import type {
  MatrixAILintCfgSource,
  MatrixAILintCfgResolved,
  RawMatrixCfg,
} from './types.js';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const MATRIXAI_LINT_CONFIG_FILENAME = 'matrixai-lint-config.json';

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

  const readResult = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  return readResult.error == null;
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
        targets: eslintTargets,
        tsconfigPaths,
        forceInclude,
      },
      shell: {
        targets: shellTargets,
      },
      markdown: {
        targets: markdownTargets,
      },
      svg: {
        targets: svgTargets,
      },
      nix: {
        targets: nixTargets,
      },
      sql: {
        targets: sqlTargets,
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
  normalizeLintConfig,
  parseLintConfig,
  resolveLintConfig,
};
