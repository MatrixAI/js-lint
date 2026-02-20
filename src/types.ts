type MatrixAILintCfg = {
  tsconfigPaths: string[];
  forceInclude: string[];
};

type RawMatrixCfg = Partial<{
  tsconfigPaths: unknown;
  forceInclude: unknown;
}>; // “might have these two keys, values are unknown”

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

export type { MatrixAILintCfg, RawMatrixCfg, CLIOptions, LintDomain };
