import type { MatrixAILintCfgResolved } from '../types.js';
import type { NativeProjectServiceOptions } from './NativeProjectService.js';
import path from 'node:path';
import process from 'node:process';
import { createRequire, registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import NativeProjectService from './NativeProjectService.js';
import { resolveLintConfig } from '../config.js';

type NativeTypeScriptProvenance = {
  backend: 'native';
  native: { path: string; version: string };
  compatibility: { path: string; version: string };
};

type ContentMapperPolicy = {
  enabled: boolean;
  source: 'cli' | 'config' | 'default';
};

function resolveContentMapperPolicy(
  configured: boolean | undefined,
  forceDisabled: boolean,
): ContentMapperPolicy {
  if (forceDisabled) return { enabled: false, source: 'cli' };
  if (configured !== undefined) {
    return { enabled: configured, source: 'config' };
  }
  return { enabled: false, source: 'default' };
}

/** Owns the process-wide adapter hook and the native services for project roots. */
class NativeTypeScriptBackend {
  protected readonly optionsByRoot = new Map<
    string,
    NativeProjectServiceOptions
  >();
  protected readonly servicesByRoot = new Map<string, NativeProjectService>();
  protected readonly mapperDisablesByRoot = new Map<string, number>();
  protected provenance?: NativeTypeScriptProvenance;

  /** Hold the override across preset reconfiguration until the run finishes. */
  public disableContentMappers(root: string): void {
    const key = path.resolve(root);
    this.mapperDisablesByRoot.set(
      key,
      (this.mapperDisablesByRoot.get(key) ?? 0) + 1,
    );
  }

  public restoreContentMappers(root: string): void {
    const key = path.resolve(root);
    const count = this.mapperDisablesByRoot.get(key) ?? 0;
    if (count <= 1) this.mapperDisablesByRoot.delete(key);
    else this.mapperDisablesByRoot.set(key, count - 1);
  }

  public configure(
    root = process.cwd(),
    resolvedConfig?: MatrixAILintCfgResolved,
  ): NativeTypeScriptProvenance {
    const config = resolvedConfig ?? resolveLintConfig(path.resolve(root));
    const options: NativeProjectServiceOptions = {
      root: path.resolve(config.root),
      tsconfigPaths: [...config.domains.eslint.tsconfigPaths],
      trustContentMappers: resolveContentMapperPolicy(
        config.domains.eslint.contentMappers,
        this.mapperDisablesByRoot.has(path.resolve(config.root)),
      ).enabled,
    };
    const previous = this.optionsByRoot.get(options.root);
    if (
      previous != null &&
      (previous.trustContentMappers !== options.trustContentMappers ||
        JSON.stringify(previous.tsconfigPaths) !==
          JSON.stringify(options.tsconfigPaths))
    ) {
      this.closeProject(options.root);
    }
    this.optionsByRoot.set(options.root, options);
    if (this.provenance != null) return this.provenance;

    const requireBackend = createRequire(import.meta.url);
    const nativeManifestPath = requireBackend.resolve(
      '@typescript/native/package.json',
    );
    const nativeManifest = requireBackend(nativeManifestPath) as {
      version: string;
    };
    const compatibilityPath = requireBackend.resolve('typescript');
    const compatibility = requireBackend(compatibilityPath) as {
      version: string;
    };
    const requireParser = createRequire(
      requireBackend.resolve('@typescript-eslint/parser'),
    );
    const estreeManifest = requireParser.resolve(
      '@typescript-eslint/typescript-estree/package.json',
    );
    const estreeNativeDirectory = path.join(
      path.dirname(estreeManifest),
      'dist/native',
    );
    const adapterPath = fileURLToPath(
      new URL('./nativeTypeScriptAdapter.js', import.meta.url),
    );

    registerHooks({
      resolve(specifier, context, nextResolve) {
        if (
          specifier === 'typescript' &&
          context.parentURL?.startsWith('file:')
        ) {
          const parent = fileURLToPath(context.parentURL).replaceAll('\\', '/');
          if (
            /\/node_modules\/(?:@typescript-eslint\/[^/]+|ts-api-utils)\//u.test(
              parent,
            )
          ) {
            return nextResolve(compatibilityPath, context);
          }
        }
        if (
          specifier === './createNativeProjectService' &&
          context.parentURL?.startsWith(
            pathToFileURL(estreeNativeDirectory).href + '/',
          )
        ) {
          return nextResolve(adapterPath, context);
        }
        return nextResolve(specifier, context);
      },
    });
    this.provenance = {
      backend: 'native',
      native: { path: nativeManifestPath, version: nativeManifest.version },
      compatibility: {
        path: compatibilityPath,
        version: compatibility.version,
      },
    };
    return this.provenance;
  }

  public getProvenance(): NativeTypeScriptProvenance | null {
    return this.provenance ?? null;
  }

  public getProjectService(cwd: string): NativeProjectService {
    const root = path.resolve(cwd);
    const options = this.optionsByRoot.get(root);
    if (options == null) {
      throw new Error(
        `Native TypeScript project service is not configured for ${root}.`,
      );
    }
    let service = this.servicesByRoot.get(root);
    if (service == null) {
      service = new NativeProjectService(options);
      this.servicesByRoot.set(root, service);
    }
    return service;
  }

  public closeProject(root: string): void {
    const key = path.resolve(root);
    this.servicesByRoot.get(key)?.close();
    this.servicesByRoot.delete(key);
    this.optionsByRoot.delete(key);
  }

  public clear(): void {
    for (const root of this.optionsByRoot.keys()) this.closeProject(root);
  }
}

// The upstream parser uses CommonJS; preset and test loaders can use ESM.
// Share one owner even when they instantiate separate module graphs.
const stateKey = Symbol.for(
  '@matrixai/lint/native-typescript-backend/8.72.3-alpha.7',
);
const globals = globalThis as typeof globalThis & {
  [key: symbol]: NativeTypeScriptBackend | undefined;
};
const nativeTypeScriptBackend = (globals[stateKey] ??=
  new NativeTypeScriptBackend());

export type { NativeTypeScriptProvenance, ContentMapperPolicy };
export {
  NativeTypeScriptBackend,
  nativeTypeScriptBackend,
  resolveContentMapperPolicy,
};
