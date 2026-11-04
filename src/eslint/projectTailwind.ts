import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

/** Resolve only from the consumer, without changing the process directory. */
function resolveProjectTailwind(root: string) {
  const requireProject = createRequire(path.join(root, 'package.json'));
  let manifestPath: string;
  try {
    manifestPath = requireProject.resolve('tailwindcss/package.json');
  } catch (cause) {
    throw new Error(
      `Tailwind linting requires the consumer's tailwindcss dependency, resolved from ${root}. Install Tailwind CSS v4 in the consumer; the lint tool does not supply a fallback.`,
      { cause },
    );
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    version: string;
  };
  if (!manifest.version.startsWith('4.')) {
    throw new Error(
      `Unsupported consumer Tailwind CSS ${manifest.version} at ${manifestPath}. This preset supports Tailwind CSS v4 only.`,
    );
  }
  return { path: manifestPath, version: manifest.version };
}

function validateTailwindEntrypoint(root: string, entrypoint: unknown) {
  if (entrypoint === undefined) return;
  if (typeof entrypoint !== 'string' || !path.isAbsolute(entrypoint)) {
    throw new Error(
      'settings.tailwindcss.cssConfigPath must be an absolute filesystem path.',
    );
  }
  try {
    if (!fs.statSync(entrypoint).isFile()) {
      throw new Error('Not a regular file.');
    }
    fs.accessSync(entrypoint, fs.constants.R_OK);
  } catch (cause) {
    throw new Error(
      `Invalid Tailwind CSS entrypoint ${entrypoint}. Set settings.tailwindcss.cssConfigPath in eslint.settings.json or your native ESLint config to the actual consumer stylesheet.`,
      { cause },
    );
  }
  const project = resolveProjectTailwind(root);
  const stylesheet = resolveProjectTailwind(path.dirname(entrypoint));
  if (project.path !== stylesheet.path) {
    throw new Error(
      `Tailwind dependency mismatch: project uses ${project.path}, but CSS entrypoint ${entrypoint} resolves ${stylesheet.path}. Run lint from the owning consumer root; do not mix Tailwind installations in one lint run.`,
    );
  }
}

export { resolveProjectTailwind, validateTailwindEntrypoint };
