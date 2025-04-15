type MatrixAILintCfg = {
  tsconfigPaths: string[];
  forceInclude: string[];
};

type RawMatrixCfg = Partial<{
  tsconfigPaths: unknown;
  forceInclude: unknown;
}>; // “might have these two keys, values are unknown”

export type { MatrixAILintCfg, RawMatrixCfg };
