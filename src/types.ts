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

type LintDomain = 'eslint' | 'shell' | 'markdown';

type CLIOptions = {
  fix: boolean;
  verbose?: number;
  userConfig: boolean;
  eslintConfig?: string;
  eslint?: string[];
  shell?: string[];
  domain?: LintDomain[];
  skipDomain?: LintDomain[];
  listDomains?: boolean;
  explain?: boolean;
};

export type {
  MatrixAILintCfg,
  MatrixAILintCfgSource,
  MatrixAILintCfgResolved,
  RawMatrixCfg,
  CLIOptions,
  LintDomain,
};
