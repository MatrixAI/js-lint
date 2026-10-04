import type Logger from '@matrixai/logger';

type MatrixAILintCfgSource = 'default' | 'config';

type RawMatrixCfg = {
  version: 2;
  root?: unknown;
  domains?: {
    eslint?: {
      targets?: unknown;
      tsconfigPaths?: unknown;
      forceInclude?: unknown;
    };
    shell?: {
      targets?: unknown;
    };
    markdown?: {
      targets?: unknown;
    };
    svg?: {
      targets?: unknown;
    };
    nix?: {
      targets?: unknown;
    };
    sql?: {
      targets?: unknown;
    };
  };
};

type MatrixAILintCfgDomainScope = {
  targets: string[];
};

type MatrixAILintCfg = {
  version: 2;
  root: string;
  source: MatrixAILintCfgSource;
  configFilePath: string;
  domains: {
    eslint: MatrixAILintCfgDomainScope & {
      tsconfigPaths: string[];
      forceInclude: string[];
    };
    shell: MatrixAILintCfgDomainScope;
    markdown: MatrixAILintCfgDomainScope;
    svg: MatrixAILintCfgDomainScope;
    nix: MatrixAILintCfgDomainScope;
    sql: MatrixAILintCfgDomainScope;
  };
};

type MatrixAILintCfgResolved = MatrixAILintCfg;

type LintDomain = 'eslint' | 'shell' | 'markdown' | 'svg' | 'nix' | 'sql';

type CLIOptions = {
  fix: boolean;
  verbose?: number;
  userConfig: boolean;
  eslintConfig?: string;
  eslint?: string[];
  shell?: string[];
  markdown?: string[];
  svg?: string[];
  nix?: string[];
  sql?: string[];
  domain?: LintDomain[];
  skipDomain?: LintDomain[];
  listDomains?: boolean;
  explain?: boolean;
};

type LintDomainEngineContext = {
  fix: boolean;
  logger: Logger;
  chosenConfig?: string;
  isConfigValid: boolean;
  eslintPatterns?: string[];
  shellPatterns?: string[];
  markdownPatterns?: string[];
  svgPatterns?: string[];
  nixPatterns?: string[];
  sqlPatterns?: string[];
};

type LintDomainAvailabilityKind = 'required' | 'optional';

type LintDomainDetection = {
  relevant: boolean;
  relevanceReason?: string;
  available: boolean;
  availabilityKind: LintDomainAvailabilityKind;
  unavailableReason?: string;
  matchedFiles?: string[];
};

type LintDomainPluginResult = {
  hadFailure: boolean;
};

type LintDomainSelectionSource =
  | 'default'
  | 'domain-flag'
  | 'target-flag'
  | 'unselected';

type LintDomainPlannedAction =
  | 'run'
  | 'skip-unselected'
  | 'skip-not-relevant'
  | 'skip-unavailable'
  | 'fail-unavailable'
  | 'fail-detection';

type LintDomainDecision = {
  domain: LintDomain;
  description: string;
  selected: boolean;
  explicitlyRequested: boolean;
  selectionSource: LintDomainSelectionSource;
  detection: LintDomainDetection | null;
  plannedAction: LintDomainPlannedAction;
  detectionError?: string;
};

type LintDomainDetect = (
  context: LintDomainEngineContext,
) => Promise<LintDomainDetection> | LintDomainDetection;

type LintDomainRun = (
  context: LintDomainEngineContext,
  detection: LintDomainDetection,
) => Promise<LintDomainPluginResult> | LintDomainPluginResult;

type LintDomainPlugin = {
  domain: LintDomain;
  description: string;
  detect: LintDomainDetect;
  run: LintDomainRun;
};

export type {
  CLIOptions,
  LintDomain,
  LintDomainAvailabilityKind,
  LintDomainDecision,
  LintDomainDetect,
  LintDomainDetection,
  LintDomainEngineContext,
  LintDomainPlannedAction,
  LintDomainPlugin,
  LintDomainPluginResult,
  LintDomainRun,
  LintDomainSelectionSource,
  MatrixAILintCfg,
  MatrixAILintCfgDomainScope,
  MatrixAILintCfgSource,
  MatrixAILintCfgResolved,
  RawMatrixCfg,
};
