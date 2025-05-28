/** @type {import('prettier').Config} */
export const semi = true;
export const trailingComma = "all";
export const singleQuote = true;
export const printWidth = 80;
export const tabWidth = 2;
export const useTabs = false;
export const endOfLine = "lf";
export const overrides = [
  {
    files: ["*.md", "*.mdx"],
    options: { proseWrap: "always" },
  },
];
