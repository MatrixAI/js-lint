const DEFAULT_ESLINT_SEARCH_ROOTS = ['./src', './scripts', './tests'] as const;

const DEFAULT_SHELLCHECK_SEARCH_ROOTS = [
  './src',
  './scripts',
  './tests',
] as const;

const DEFAULT_MARKDOWN_ROOT_FILES = ['README.md', 'AGENTS.md'] as const;

const DEFAULT_MARKDOWN_SEARCH_ROOTS = [
  './README.md',
  './AGENTS.md',
  './specs',
  './pages',
  './blog',
  './docs',
] as const;

const DEFAULT_SVG_SEARCH_ROOTS = [
  './src',
  './specs',
  './pages',
  './docs',
] as const;

const DEFAULT_NIXFMT_SEARCH_PATTERNS = [
  './flake.nix',
  './shell.nix',
  './default.nix',
  './nix/**/*.nix',
] as const;

const DEFAULT_SQLFLUFF_SEARCH_PATTERNS = [
  './src',
  './scripts',
  './tests',
  './sql',
  './migrations',
  './db',
  './database',
  './prisma',
  './supabase',
  './*.sql',
] as const;

export {
  DEFAULT_ESLINT_SEARCH_ROOTS,
  DEFAULT_SHELLCHECK_SEARCH_ROOTS,
  DEFAULT_MARKDOWN_ROOT_FILES,
  DEFAULT_MARKDOWN_SEARCH_ROOTS,
  DEFAULT_SVG_SEARCH_ROOTS,
  DEFAULT_NIXFMT_SEARCH_PATTERNS,
  DEFAULT_SQLFLUFF_SEARCH_PATTERNS,
};
