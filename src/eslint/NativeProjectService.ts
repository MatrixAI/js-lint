import type { Snapshot } from '@typescript/native/sync';
import path from 'node:path';
import { API } from '@typescript/native/sync';
import { createFileSystemLayer } from '@typescript/native/fs';

type NativeProjectServiceOptions = {
  root: string;
  tsconfigPaths: string[];
  trustContentMappers: boolean;
};

/** Owns the native compiler process and snapshots for one project root. */
class NativeProjectService {
  protected readonly api: API;
  protected readonly options: NativeProjectServiceOptions;
  protected snapshot?: Snapshot;
  protected closed = false;

  public constructor(options: NativeProjectServiceOptions) {
    this.options = options;
    this.api = new API({
      cwd: options.root,
      runExternalCode: options.trustContentMappers,
    });
  }

  public openFile(filePath: string, code: string) {
    if (this.closed) {
      throw new Error('The native TypeScript project service is closed.');
    }
    const compilerPath = toCompilerPath(filePath);
    const previous = this.snapshot;
    const parameters = {
      ensurePrograms: true as const,
      fileSystem: createFileSystemLayer([[compilerPath, code]]),
    };
    const snapshot = previous
      ? previous.update(parameters)
      : this.api.createSnapshot({
          ...parameters,
          openProjects: this.options.tsconfigPaths.map(toCompilerPath),
        });
    this.snapshot = snapshot;
    if (previous !== snapshot) previous?.dispose();

    for (const configuredPath of this.options.tsconfigPaths) {
      const configFileName = toCompilerPath(configuredPath);
      const project = snapshot.getConfiguredProject(configFileName);
      if (project == null) {
        throw new Error(
          `Unable to open native TypeScript project ${configuredPath}.`,
        );
      }
      const sourceFile = project.program.getSourceFile(compilerPath);
      if (sourceFile == null) continue;
      if (sourceFile.text !== code) {
        throw new Error(
          `Cannot safely lint transformed source ${filePath}: native mapper source ranges may not match the original file.`,
        );
      }

      const config = this.api.parseConfigFile(configFileName);
      const configDiagnostics = [
        ...project.program.getConfigFileParsingDiagnostics(),
        ...project.program
          .getProgramDiagnostics()
          .filter((diagnostic) => [5090, 5102, 5108].includes(diagnostic.code)),
      ].filter((diagnostic) => diagnostic.code !== 18068);
      if (configDiagnostics.length > 0) {
        throw new Error(
          `Native TypeScript project configuration failed: ${configDiagnostics.map((diagnostic) => diagnostic.text).join('; ')}`,
        );
      }
      const raw = config.raw as { contentMappers?: unknown } | undefined;
      const mappers = Array.isArray(raw?.contentMappers)
        ? raw.contentMappers
        : [];
      const extensions = mappers.flatMap((mapper: unknown) => {
        if (typeof mapper !== 'object' || mapper == null) return [];
        const value = (mapper as { extensions?: unknown }).extensions;
        return Array.isArray(value)
          ? value.filter(
              (extension): extension is string => typeof extension === 'string',
            )
          : [];
      });
      if (extensions.length > 0) {
        const missing = project.program
          .getSemanticDiagnostics()
          .find((diagnostic) => {
            if (diagnostic.code !== 2307) return false;
            const specifier = /^Cannot find module ['"]([^'"]+)['"]/u.exec(
              String(diagnostic.text),
            )?.[1];
            if (specifier == null) return false;
            return extensions.some((extension) =>
              specifier.endsWith(extension),
            );
          });
        if (missing != null) {
          const trustHint = this.options.trustContentMappers
            ? 'Check the content mapper and its dependencies.'
            : 'To execute trusted project mappers, set MATRIXAI_LINT_TRUST_CONTENT_MAPPERS=1.';
          throw new Error(
            `Mapped import has no type declarations: ${missing.text} ${trustHint}`,
          );
        }
      }
      return { api: this.api, configFileName, project, sourceFile };
    }
    throw new Error(
      `${filePath} was not found in any configured TypeScript project.`,
    );
  }

  public close(): void {
    if (this.closed) return;
    this.closed = true;
    this.snapshot?.dispose();
    this.api.close();
  }
}

function toCompilerPath(filePath: string): string {
  return path
    .resolve(filePath)
    .replaceAll('\\', '/')
    .replace(/^[A-Z]:\//u, (drive) => drive.toLowerCase());
}

export type { NativeProjectServiceOptions };
export default NativeProjectService;
