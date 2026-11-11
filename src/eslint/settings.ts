import type { Linter } from 'eslint';
import fs from 'node:fs';
import path from 'node:path';

/** Load native shared ESLint settings without duplicating the shared preset. */
function loadESLintSettings(root: string): Linter.Config['settings'] {
  const file = path.join(root, 'eslint.settings.json');
  if (!fs.existsSync(file)) return {};
  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (
      settings == null ||
      typeof settings !== 'object' ||
      Array.isArray(settings)
    ) {
      throw new Error(
        'Expected a JSON object of native ESLint shared settings.',
      );
    }
    if (settings.tailwindcss !== undefined) {
      const tailwind = settings.tailwindcss;
      if (
        tailwind == null ||
        typeof tailwind !== 'object' ||
        Array.isArray(tailwind)
      ) {
        throw new Error('tailwindcss must be an object.');
      }
      if ('cssConfigPath' in tailwind) {
        const entrypoint = tailwind.cssConfigPath;
        if (typeof entrypoint !== 'string' || entrypoint.trim() === '') {
          throw new Error(
            'tailwindcss.cssConfigPath must be a non-empty filesystem path.',
          );
        }
        settings.tailwindcss = {
          ...tailwind,
          cssConfigPath: path.resolve(path.dirname(file), entrypoint),
        };
      }
    }
  } catch (cause) {
    throw new Error(
      `Invalid native ESLint settings in ${file}: ${String(cause)}`,
      { cause },
    );
  }
  return settings;
}

export { loadESLintSettings };
