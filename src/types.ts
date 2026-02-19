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
  userConfig: boolean;
  config?: string;
  eslint?: string[];
  shell?: string[];
  only?: LintDomain[];
  skip?: LintDomain[];
};

export type { MatrixAILintCfg, RawMatrixCfg, CLIOptions, LintDomain };
