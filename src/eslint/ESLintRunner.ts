import type { MatrixAILintCfgResolved } from '../types.js';
import type Logger from '@matrixai/logger';
import path from 'node:path';
import process from 'node:process';
import url from 'node:url';
import { ESLint } from 'eslint';
import { loadESLintSettings } from './settings.js';
import {
  resolveProjectTailwind,
  validateTailwindEntrypoint,
} from './projectTailwind.js';
import { nativeTypeScriptBackend } from './NativeTypeScriptBackend.js';
import ESLintScope from './ESLintScope.js';
import { resolveLintConfig } from '../config.js';
import FileDiscovery from '../FileDiscovery.js';

const ESLINT_TARGET_EXTENSIONS = [
  'js',
  'mjs',
  'cjs',
  'jsx',
  'ts',
  'tsx',
  'mts',
  'cts',
  'json',
] as const;

const ESLINT_TARGET_FILE_EXTENSIONS = ESLINT_TARGET_EXTENSIONS.map(
  (extension) => `.${extension}`,
);

/** Runs ESLint and owns native project services for a lint operation. */
class ESLintRunner {
  public constructor(protected readonly logger: Logger) {}

  public async run({
    fix,
    configPath,
    explicitGlobs,
    resolvedConfig,
    disableContentMappers = false,
  }: {
    fix: boolean;
    configPath?: string;
    explicitGlobs?: string[];
    resolvedConfig?: MatrixAILintCfgResolved;
    disableContentMappers?: boolean;
  }): Promise<boolean> {
    const logger = this.logger;
    const dirname = path.dirname(url.fileURLToPath(import.meta.url));
    const defaultConfigPath = path.resolve(dirname, '../configs/eslint.js');
    const resolvedConfigPath = configPath || defaultConfigPath;
    const lintConfig = resolvedConfig ?? resolveLintConfig();
    if (disableContentMappers) {
      nativeTypeScriptBackend.disableContentMappers(lintConfig.root);
    }
    try {
      const compiler = nativeTypeScriptBackend.configure(
        lintConfig.root,
        lintConfig,
      );
      logger.info(
        `Using native TypeScript ${compiler.native.version}: ${compiler.native.path}`,
      );
      if (
        resolvedConfigPath === defaultConfigPath &&
        lintConfig.domains.eslint.tailwindEnabled
      ) {
        const tailwind = resolveProjectTailwind(lintConfig.root);
        const settings = loadESLintSettings(lintConfig.root);
        const tailwindSettings = settings?.tailwindcss as
          Record<string, unknown> | undefined;
        validateTailwindEntrypoint(
          lintConfig.root,
          tailwindSettings?.cssConfigPath,
        );
        logger.info(
          `Using project Tailwind CSS ${tailwind.version}: ${tailwind.path}`,
        );
      }
      const parserProjectOverride = {
        languageOptions: {
          parserOptions: {
            project: false,
            projectService: { EXPERIMENTAL_backend: 'tsgo' },
            tsconfigRootDir: lintConfig.root,
          },
        },
      };

      if (explicitGlobs?.length) {
        logger.info('Linting with explicit patterns:');
        explicitGlobs.forEach((pattern) => {
          logger.info(`Linting: ${pattern}`);
        });

        const eslint = new ESLint({
          overrideConfigFile: resolvedConfigPath,
          fix,
          errorOnUnmatchedPattern: false,
          warnIgnored: false,
          ignorePatterns: [],
          cache: false,
          cacheLocation: '.cache/matrixai-lint/eslint/.eslintcache',
          cacheStrategy: 'content',
          overrideConfig: parserProjectOverride,
        });

        return await this.lintAndReport(eslint, explicitGlobs, fix);
      }

      const { forceInclude, tsconfigPaths } = lintConfig.domains.eslint;

      if (tsconfigPaths.length === 0) {
        logger.error('[matrixai-lint] ⚠ No tsconfig.json files found.');
        return true;
      }

      logger.info(`Found ${tsconfigPaths.length} tsconfig.json files:`);
      tsconfigPaths.forEach((tsconfigPath) => {
        logger.info(`Using tsconfig: ${tsconfigPath}`);
      });

      const { files: patterns, ignore: ignorePats } =
        new ESLintScope().buildPatterns(
          tsconfigPaths,
          forceInclude,
          process.cwd(),
          lintConfig.root,
        );

      if (patterns.length === 0) {
        logger.warn(
          '[matrixai-lint] ⚠ No ESLint targets were derived from configured tsconfig paths.',
        );
        return false;
      }

      logger.info('Linting files:');
      patterns.forEach((pattern) => {
        logger.info(`Linting: ${pattern}`);
      });

      const resolvedPatterns = new FileDiscovery().resolveFilesFromPatterns(
        patterns,
        ESLINT_TARGET_FILE_EXTENSIONS,
      );

      if (resolvedPatterns.length === 0) {
        logger.warn(
          '[matrixai-lint] ⚠ No ESLint targets matched after guarded traversal.',
        );
        return false;
      }

      const eslint = new ESLint({
        overrideConfigFile: resolvedConfigPath,
        fix,
        errorOnUnmatchedPattern: false,
        warnIgnored: false,
        ignorePatterns: ignorePats,
        cache: false,
        cacheLocation: '.cache/matrixai-lint/eslint/.eslintcache',
        cacheStrategy: 'content',
        overrideConfig: parserProjectOverride,
      });

      return await this.lintAndReport(eslint, resolvedPatterns, fix);
    } finally {
      try {
        nativeTypeScriptBackend.closeProject(lintConfig.root);
      } finally {
        if (disableContentMappers) {
          nativeTypeScriptBackend.restoreContentMappers(lintConfig.root);
        }
      }
    }
  }

  protected async lintAndReport(
    eslint: ESLint,
    patterns: string[],
    fix: boolean,
  ): Promise<boolean> {
    const logger = this.logger;
    let results;
    try {
      results = await eslint.lintFiles(patterns);
    } catch (cause) {
      if (
        cause instanceof Error &&
        /tailwindcss|tailwind|cssConfigPath/iu.test(cause.message)
      ) {
        throw new Error(
          `Tailwind lint initialization failed. Install the consumer's Tailwind CSS v4 dependency and set settings.tailwindcss.cssConfigPath to its actual stylesheet using eslint.settings.json or native ESLint configuration. ${cause.message}`,
          { cause },
        );
      }
      throw cause;
    }

    if (fix) {
      await ESLint.outputFixes(results);
    }

    const errorCount = results.reduce(
      (sum, result) => sum + result.errorCount,
      0,
    );
    const warningCount = results.reduce(
      (sum, result) => sum + result.warningCount,
      0,
    );
    logger.info(
      `ESLint summary: files=${results.length} errors=${errorCount} warnings=${warningCount} fix=${fix ? 'on' : 'off'}`,
    );

    const formatter = await eslint.loadFormatter('stylish');
    const formattedOutput = await formatter.format(results);
    for (const line of formattedOutput.split(/\r?\n/)) {
      const normalizedLine = line.trim();
      if (normalizedLine.length > 0) {
        logger.info(`ESLint detail: ${normalizedLine}`);
      }
    }

    const hasErrors = errorCount > 0;

    return hasErrors;
  }
}

export default ESLintRunner;
