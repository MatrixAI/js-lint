import ts from 'typescript';

export interface Patterns {
  files: string[];
  ignore: string[];
}

export function buildPatterns(
  tsconfigPath: string,
  forceInclude: string[] = [],
): Patterns {
  const { config } = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  const strip = (p: string) => p.replace(/^\.\//, '');

  const include = (config.include ?? []).map(strip);
  const exclude = (config.exclude ?? []).map(strip);

  // forceInclude overrides exclude
  const ignore = exclude.filter(
    (ex) => !forceInclude.some((fi) => fi.startsWith(ex) || ex.startsWith(fi)),
  );

  const files = [
    ...include.map((g) => `${g}.{js,mjs,ts,mts,jsx,tsx,json}`),
    ...forceInclude.map((g) => `${g}.{js,mjs,ts,mts,jsx,tsx,json}`),
  ];

  if (!exclude.length) {
    ignore.push('node_modules/**', 'bower_components/**', 'jspm_packages/**');
  }

  return { files, ignore };
}
