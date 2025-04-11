// Utils/resolveMatrixConfig.ts
import fs from 'node:fs';
import path from 'node:path';

interface MatrixLintConfig {
  tsconfigPaths: string[];
  forceInclude: string[];
}

export function resolveMatrixConfig(
  repoRoot = process.cwd(),
): MatrixLintConfig {
  const cfgPath = path.join(repoRoot, 'matrixai-lint-config.json');

  const abs = (p: string) => path.resolve(repoRoot, p);
  const exists = (p: string) => fs.existsSync(p);

  let rawCfg: unknown = {};

  if (exists(cfgPath)) {
    try {
      const text = fs.readFileSync(cfgPath, 'utf8').trim();
      rawCfg = text.length ? JSON.parse(text) : {};
    } catch {
      console.error(
        '[matrixai‑lint]  ✖  matrixai-lint-config.json is not valid JSON – falling back to defaults.',
      );
    }
  }

  // ---------- helpers ----------
  const toStringArray = (v: unknown): string[] =>
    typeof v === 'string'
      ? [v]
      : Array.isArray(v)
        ? v.filter((x): x is string => typeof x === 'string')
        : [];

  const cfg = rawCfg as { tsconfigPaths?: unknown; forceInclude?: unknown };

  // ---------- tsconfigPaths ----------
  const tsconfigPaths = toStringArray(cfg.tsconfigPaths)
    .map(abs)
    .filter((p) => {
      if (exists(p)) return true;
      console.warn(`[matrixai‑lint]  ⚠  tsconfig not found: ${p}`);
      return false;
    });

  // ---------- forceInclude ----------
  const forceInclude = toStringArray(cfg.forceInclude).map((g) =>
    g.replace(/^\.\//, ''),
  );

  // ---------- fallback to root tsconfig ----------
  if (tsconfigPaths.length === 0) {
    const rootTs = path.join(repoRoot, 'tsconfig.json');
    if (exists(rootTs)) tsconfigPaths.push(rootTs);
  }

  return { tsconfigPaths, forceInclude };
}
