type MatrixAILintCfg = {
  tsconfigPaths: string[];
  forceInclude: string[];
};

type RawMatrixCfg = Partial<{
  tsconfigPaths: unknown;
  forceInclude: unknown;
}>; // “might have these two keys, values are unknown”

type CLIOptions = {
  fix: boolean;
  userConfig: boolean;
  config?: string;
  eslint?: string[];
  shell?: string[];
}


export type { MatrixAILintCfg, RawMatrixCfg, CLIOptions };
