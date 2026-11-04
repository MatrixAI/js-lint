import type * as TypeScript from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire, registerHooks } from 'node:module';
import semver from 'semver';

type ProjectTypeScript = {
  path: string;
  version: string;
  api: typeof TypeScript;
};

const requireBackend = createRequire(import.meta.url);
let activeTypeScript: ProjectTypeScript | undefined;
let resolvingProject = false;

function resolveProjectTypeScript(root = process.cwd()): ProjectTypeScript {
  const requireProject = createRequire(path.resolve(root, 'package.json'));
  let compilerPath: string;
  resolvingProject = true;
  try {
    compilerPath = requireProject.resolve('typescript');
  } catch (cause) {
    throw new Error(
      `TypeScript linting requires the project's typescript dependency, resolved from ${root}. Install it in the project; the lint application does not supply a fallback compiler.`,
      { cause },
    );
  } finally {
    resolvingProject = false;
  }
  const api = requireProject(compilerPath) as typeof TypeScript;
  const parserManifest = JSON.parse(
    fs.readFileSync(
      requireBackend.resolve('@typescript-eslint/parser/package.json'),
      'utf8',
    ),
  ) as { peerDependencies: { typescript: string } };
  const supported = parserManifest.peerDependencies.typescript;
  if (!semver.satisfies(api.version, supported, { includePrerelease: true })) {
    throw new Error(
      `Project TypeScript ${api.version} at ${compilerPath} is unsupported by the lint parser (requires ${supported}).`,
    );
  }
  return { path: compilerPath, version: api.version, api };
}

function configureProjectTypeScript(root = process.cwd()): ProjectTypeScript {
  const compiler = resolveProjectTypeScript(root);
  if (activeTypeScript !== undefined) {
    if (activeTypeScript.path !== compiler.path) {
      throw new Error(
        'A lint process cannot switch TypeScript installations after loading the parser. Run a separate lint process for each project compiler.',
      );
    }
    return activeTypeScript;
  }
  activeTypeScript = compiler;
  // Parser dependencies use CommonJS as well as ESM. Synchronous hooks cover
  // both, before either module graph captures its TypeScript instance.
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === 'typescript' && !resolvingProject) {
        return nextResolve(compiler.path, context);
      }
      return nextResolve(specifier, context);
    },
  });
  return compiler;
}

function projectTypeScriptProvenance(): {
  path: string;
  version: string;
} | null {
  if (activeTypeScript === undefined) return null;
  return { path: activeTypeScript.path, version: activeTypeScript.version };
}

export type { ProjectTypeScript };
export {
  resolveProjectTypeScript,
  configureProjectTypeScript,
  projectTypeScriptProvenance,
};
