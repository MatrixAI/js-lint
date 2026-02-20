import type {
  MatrixAILintCfgSource,
  MatrixAILintCfgResolved,
  RawMatrixCfg,
} from './types.js';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

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

function sanitizeTsconfigPaths(rawValue: unknown, root: string): string[] {
  return toStringArray(rawValue)
    .map((tsconfigPath) => path.resolve(root, tsconfigPath))
    .filter((tsconfigPath) => fs.existsSync(tsconfigPath));
}

function sanitizeForceInclude(rawValue: unknown): string[] {
  return toStringArray(rawValue).map((glob) => stripLeadingDotSlash(glob));
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
  const rawEslintDomain = isRecord(rawDomains.eslint)
    ? rawDomains.eslint
    : ({} as Record<string, unknown>);

  const tsconfigPaths = sanitizeTsconfigPaths(
    rawEslintDomain.tsconfigPaths,
    resolvedRoot,
  );
  const forceInclude = sanitizeForceInclude(rawEslintDomain.forceInclude);

  if (tsconfigPaths.length === 0) {
    const rootTsconfigPath = path.join(resolvedRoot, 'tsconfig.json');
    if (fs.existsSync(rootTsconfigPath)) {
      tsconfigPaths.push(rootTsconfigPath);
    }
  }

  return {
    version: 2,
    root: resolvedRoot,
    source,
    configFilePath,
    domains: {
      eslint: {
        tsconfigPaths,
        forceInclude,
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
