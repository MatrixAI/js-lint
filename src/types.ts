import type Logger from '@matrixai/logger';

type MatrixAILintCfgSource = 'default' | 'config';

type RawMatrixCfg = {
  version: 2;
  root?: unknown;
  domains?: {
    eslint?: {
      tsconfigPaths?: unknown;
      forceInclude?: unknown;
    };
  };
};

type MatrixAILintCfg = {
  version: 2;
  root: string;
  source: MatrixAILintCfgSource;
  configFilePath: string;
  domains: {
    eslint: {
      tsconfigPaths: string[];
      forceInclude: string[];
    };
  };
};

type MatrixAILintCfgResolved = MatrixAILintCfg;

type LintDomain = 'eslint' | 'shell' | 'markdown' | 'nix';

type CLIOptions = {
  fix: boolean;
  verbose?: number;
  userConfig: boolean;
  eslintConfig?: string;
  eslint?: string[];
  shell?: string[];
  markdown?: string[];
  nix?: string[];
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
  nixPatterns?: string[];
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
  MatrixAILintCfgSource,
  MatrixAILintCfgResolved,
  RawMatrixCfg,
};
