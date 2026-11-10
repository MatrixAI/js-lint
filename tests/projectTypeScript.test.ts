import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

const require = createRequire(import.meta.url);
const resolverUrl = pathToFileURL(
  path.resolve('dist/eslint/NativeTypeScriptBackend.js'),
).href;
const cliPath = path.resolve('dist/bin/matrixai-lint.js');

describe('project TypeScript boundary', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'matrixai-project-ts-'));
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'lint-consumer', private: true }),
    );
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function installCompiler(packageName: string): void {
    const directory = path.dirname(
      require.resolve(`${packageName}/package.json`),
    );
    fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
    fs.symlinkSync(directory, path.join(root, 'node_modules/typescript'));
  }

  function installUnusedCompiler(version: string): void {
    const directory = path.join(root, 'node_modules/typescript');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      path.join(directory, 'package.json'),
      JSON.stringify({ name: 'typescript', version, main: 'index.cjs' }),
    );
    fs.writeFileSync(
      path.join(directory, 'index.cjs'),
      "throw new Error('The project compiler must not be loaded by lint');\n",
    );
  }

  function runLint(...args: string[]) {
    return spawnSync(process.execPath, [cliPath, ...args], {
      cwd: root,
      encoding: 'utf8',
      timeout: 30000,
      env: { ...process.env, MATRIXAI_LINT_TRUST_CONTENT_MAPPERS: '' },
    });
  }

  test('uses the native backend without requiring a project compiler', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { nativeTypeScriptBackend } from ${JSON.stringify(resolverUrl)};
         console.log(JSON.stringify(nativeTypeScriptBackend.configure(${JSON.stringify(root)})));`,
      ],
      { cwd: root, encoding: 'utf8' },
    );
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      backend: 'native',
      native: { version: '7.1.0-beta' },
      compatibility: { version: '6.0.3' },
    });
  });

  test('Markdown-only checks need no TypeScript even with a tsconfig present', () => {
    fs.writeFileSync(path.join(root, 'README.md'), '# Consumer\n');
    fs.writeFileSync(path.join(root, 'tsconfig.json'), '{}\n');
    const result = spawnSync(
      process.execPath,
      [cliPath, '--check', '--markdown', 'README.md'],
      { cwd: root, encoding: 'utf8' },
    );
    expect(result.status).toBe(0);
  });

  test('Rust-only discovery needs neither TypeScript nor an npm project', () => {
    fs.rmSync(path.join(root, 'package.json'));
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(
      path.join(root, 'Cargo.toml'),
      '[package]\nname = "consumer"\nversion = "0.1.0"\nedition = "2021"\n',
    );
    fs.writeFileSync(path.join(root, 'src/lib.rs'), 'pub fn value() {}\n');
    const result = spawnSync(process.execPath, [cliPath, '--plan'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout + result.stderr).not.toContain('requires the project');
  });

  test('typed ESLint does not launch the consumer compiler CLI', () => {
    const compilerPackage = path.dirname(
      require.resolve('typescript/package.json'),
    );
    fs.mkdirSync(path.join(root, 'node_modules/.bin'), { recursive: true });
    fs.symlinkSync(compilerPackage, path.join(root, 'node_modules/typescript'));
    const marker = path.join(root, 'compiler-cli-was-run');
    const tsc = path.join(root, 'node_modules/.bin/tsc');
    fs.writeFileSync(tsc, `#!/bin/sh\ntouch '${marker}'\nexit 1\n`, {
      mode: 0o755,
    });
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(
      path.join(root, 'src/example.ts'),
      'function identity(value: number): number {\n  return value;\n}\n\nexport { identity };\n',
    );
    fs.writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { target: 'ES2022', module: 'NodeNext' },
        include: ['src'],
      }),
    );
    const report = path.join(root, 'report.json');
    const result = spawnSync(
      process.execPath,
      [cliPath, '--check', '--eslint', 'src', '--report', report],
      {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${path.dirname(tsc)}${path.delimiter}${process.env.PATH}`,
        },
      },
    );
    expect(result.stdout + result.stderr).toContain('Linting passed');
    expect(result.status).toBe(0);
    expect(fs.existsSync(marker)).toBe(false);
    const evidence = JSON.parse(fs.readFileSync(report, 'utf8'));
    expect(evidence.projectTypeScript.backend).toBe('native');
    expect(evidence.status).toBe('passed');
  });

  test.each([['5.6.3'], ['5.8.3'], ['5.9.3'], ['6.0.3'], ['7.1.0-beta']])(
    'uses the native backend for a project declaring TypeScript %s',
    (version) => {
      installUnusedCompiler(version);
      fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({
          name: 'lint-consumer',
          private: true,
          type: 'module',
        }),
      );
      fs.mkdirSync(path.join(root, 'src'));
      fs.writeFileSync(
        path.join(root, 'src/helper.ts'),
        'async function task(): Promise<void> {}\n\nexport { task };\n',
      );
      fs.writeFileSync(
        path.join(root, 'src/example.ts'),
        "import { task } from '#helper.js';\n\ntask();\n",
      );
      fs.writeFileSync(
        path.join(root, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            paths: { '#*': ['./src/*'] },
          },
          include: ['src'],
        }),
      );
      const report = path.join(root, 'report.json');
      const result = runLint('--check', '--eslint', 'src', '--report', report);
      const output = result.stdout + result.stderr;
      expect(output).toContain('@typescript-eslint/no-floating-promises');
      expect(result.status).not.toBe(0);
      const evidence = JSON.parse(fs.readFileSync(report, 'utf8'));
      expect(evidence.projectTypeScript.backend).toBe('native');
      expect(evidence.projectTypeScript.native.version).toBe('7.1.0-beta');
      expect(evidence.projectTypeScript.compatibility.version).toBe('6.0.3');

      const fixFile = path.join(root, 'src/fix.ts');
      fs.writeFileSync(
        fixFile,
        'const greeting="hello";\n\nexport {greeting};\n',
      );
      const fixed = runLint('--fix', '--eslint', 'src/fix.ts');
      expect(fixed.stdout + fixed.stderr).toContain('Linting passed');
      expect(fixed.status).toBe(0);
      expect(fs.readFileSync(fixFile, 'utf8')).toBe(
        "const greeting = 'hello';\n\nexport { greeting };\n",
      );
    },
    30000,
  );

  test('native compiler supports standard decorators and fix mode', () => {
    installCompiler('@typescript/native');
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'lint-consumer', private: true, type: 'module' }),
    );
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(
      path.join(root, 'src/example.ts'),
      [
        'function decorate(value: any, _context: ClassDecoratorContext) {',
        '  return value;',
        '}',
        '',
        '@decorate',
        'class Example {}',
        '',
        'const value="hello";',
        'export { Example, value };',
        '',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { target: 'ES2022', module: 'NodeNext' },
        include: ['src'],
      }),
    );
    const result = runLint('--fix', '--eslint', 'src');
    expect(result.stdout + result.stderr).toContain('Linting passed');
    expect(result.status).toBe(0);
    expect(
      fs.readFileSync(path.join(root, 'src/example.ts'), 'utf8'),
    ).toContain("const value = 'hello';");
  }, 30000);

  test('uses trusted content mapper types with an explicit lint project', () => {
    fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
    fs.symlinkSync(
      path.dirname(path.dirname(require.resolve('dotschema'))),
      path.join(root, 'node_modules/dotschema'),
    );
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'lint-consumer', private: true, type: 'module' }),
    );
    fs.mkdirSync(path.join(root, 'src'));
    const schema = path.join(root, 'src/user.schema.jsonc');
    const writeSchema = (type: string) => {
      fs.writeFileSync(
        schema,
        JSON.stringify({
          type: 'object',
          properties: { name: { type } },
          required: ['name'],
        }),
      );
    };
    writeSchema('string');
    fs.writeFileSync(
      path.join(root, 'src/example.ts'),
      [
        "import schema from './user.schema.jsonc';",
        '',
        'async function isUser(value: unknown): Promise<boolean> {',
        '  return await schema.is(value);',
        '}',
        '',
        'function formatName(value: unknown): string {',
        '  if (schema.is(value)) {',
        '    return `${value.name}`;',
        '  }',
        "  return 'invalid';",
        '}',
        '',
        'export { formatName, isUser };',
        '',
      ].join('\n'),
    );
    const tsconfig = {
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
      },
      include: ['src'],
      contentMappers: [{ package: 'dotschema', extensions: ['.schema.jsonc'] }],
    };
    fs.writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify(tsconfig),
    );
    fs.writeFileSync(
      path.join(root, 'tsconfig.lint.json'),
      JSON.stringify({ extends: './tsconfig.json', include: ['src'] }),
    );
    fs.writeFileSync(
      path.join(root, 'matrixai-lint-config.json'),
      JSON.stringify({
        version: 2,
        domains: { eslint: { tsconfigPaths: ['./tsconfig.lint.json'] } },
      }),
    );
    const configUrl = pathToFileURL(
      path.resolve('dist/configs/eslint.js'),
    ).href;
    fs.writeFileSync(
      path.join(root, 'eslint.config.mjs'),
      `import { createConfig } from ${JSON.stringify(configUrl)};
export default [...createConfig(), { rules: { '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: false, allowAny: true }] } }];
`,
    );
    const args = [
      '--check',
      '--eslint',
      'src',
      '--eslint-config',
      'eslint.config.mjs',
    ];
    const untrusted = runLint(...args);
    expect(untrusted.status).not.toBe(0);
    expect(untrusted.stdout + untrusted.stderr).toContain(
      'MATRIXAI_LINT_TRUST_CONTENT_MAPPERS=1',
    );
    fs.writeFileSync(
      path.join(root, 'src/consumer.ts'),
      "import { formatName } from './example.js';\n\nexport { formatName };\n",
    );
    const transitive = runLint('--check', '--eslint', 'src/consumer.ts');
    expect(transitive.status).not.toBe(0);
    expect(transitive.stdout + transitive.stderr).toContain(
      'MATRIXAI_LINT_TRUST_CONTENT_MAPPERS=1',
    );
    const trusted = () =>
      spawnSync(process.execPath, [cliPath, ...args], {
        cwd: root,
        encoding: 'utf8',
        timeout: 30000,
        env: { ...process.env, MATRIXAI_LINT_TRUST_CONTENT_MAPPERS: '1' },
      });
    const stringResult = trusted();
    expect(stringResult.stdout + stringResult.stderr).toContain(
      '@typescript-eslint/await-thenable',
    );
    expect(stringResult.stdout + stringResult.stderr).not.toContain(
      '@typescript-eslint/restrict-template-expressions',
    );
    fs.writeFileSync(
      path.join(root, 'src/fix.ts'),
      'const greeting="hello";\n\nexport {greeting};\n',
    );
    const fixed = spawnSync(
      process.execPath,
      [cliPath, '--fix', '--eslint', 'src/fix.ts'],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 30000,
        env: { ...process.env, MATRIXAI_LINT_TRUST_CONTENT_MAPPERS: '1' },
      },
    );
    expect(fixed.stdout + fixed.stderr).toContain('Linting passed');
    expect(fixed.status).toBe(0);
    expect(fs.readFileSync(path.join(root, 'src/fix.ts'), 'utf8')).toBe(
      "const greeting = 'hello';\n\nexport { greeting };\n",
    );
    writeSchema('number');
    const numberResult = trusted();
    expect(numberResult.stdout + numberResult.stderr).toContain(
      '@typescript-eslint/restrict-template-expressions',
    );
    tsconfig.contentMappers[0].package = 'missing-mapper';
    fs.writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify(tsconfig),
    );
    const missing = trusted();
    expect(missing.status).not.toBe(0);
    expect(missing.stdout + missing.stderr).toContain('missing-mapper');
  }, 60000);

  test('does not execute an untrusted unused content mapper', () => {
    const markerDir = path.join(root, 'node_modules/marker-mapper');
    fs.mkdirSync(markerDir, { recursive: true });
    const marker = path.join(root, 'mapper-ran');
    fs.writeFileSync(
      path.join(markerDir, 'package.json'),
      JSON.stringify({
        name: 'marker-mapper',
        version: '1.0.0',
        typescript: { contentMapper: { exec: ['node', 'mapper.cjs'] } },
      }),
    );
    fs.writeFileSync(
      path.join(markerDir, 'mapper.cjs'),
      `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran');`,
    );
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(
      path.join(root, 'src/example.ts'),
      'const value = 1;\n\nexport { value };\n',
    );
    fs.writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { target: 'ES2022', module: 'NodeNext' },
        include: ['src'],
        contentMappers: [{ package: 'marker-mapper', extensions: ['.marker'] }],
      }),
    );
    const result = runLint('--check', '--eslint', 'src');
    expect(result.stdout + result.stderr).toContain('Linting passed');
    expect(result.status).toBe(0);
    expect(fs.existsSync(marker)).toBe(false);
  }, 30000);

  test('reports invalid TypeScript compiler options', () => {
    installCompiler('@typescript/native');
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(
      path.join(root, 'src/example.ts'),
      'export const value = 1;\n',
    );
    fs.writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { target: 'ES3000' },
        include: ['src'],
      }),
    );
    const result = runLint('--check', '--eslint', 'src');
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('Parsing error');
    expect(result.stdout + result.stderr).toContain('target');
  }, 30000);

  test('uses each configured native project for its files', () => {
    for (const name of ['first', 'second']) {
      const directory = path.join(root, name);
      fs.mkdirSync(directory);
      fs.writeFileSync(
        path.join(directory, 'tsconfig.lint.json'),
        JSON.stringify({
          compilerOptions: { target: 'ES2022', module: 'NodeNext' },
          include: ['example.ts'],
        }),
      );
      fs.writeFileSync(
        path.join(directory, 'example.ts'),
        'async function task(): Promise<void> {}\n\ntask();\n',
      );
    }
    fs.writeFileSync(
      path.join(root, 'matrixai-lint-config.json'),
      JSON.stringify({
        version: 2,
        domains: {
          eslint: {
            tsconfigPaths: [
              './first/tsconfig.lint.json',
              './second/tsconfig.lint.json',
            ],
          },
        },
      }),
    );
    const result = runLint('--check', '--eslint', 'first', 'second');
    const output = result.stdout + result.stderr;
    expect(result.status).not.toBe(0);
    expect(output).toContain(path.join('first', 'example.ts'));
    expect(output).toContain(path.join('second', 'example.ts'));
    expect(
      output.match(/@typescript-eslint\/no-floating-promises/gu),
    ).toHaveLength(2);
  }, 30000);

  test('reports legacy compiler options removed by the native compiler', () => {
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(
      path.join(root, 'src/example.ts'),
      'export const value = 1;\n',
    );
    fs.writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES5',
          moduleResolution: 'node',
          baseUrl: '.',
        },
        include: ['src'],
      }),
    );
    const result = runLint('--check', '--eslint', 'src');
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('has been removed');
  }, 30000);

  test('uses the native backend with a custom shared-preset config', () => {
    installCompiler('@typescript/native');
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'lint-consumer', private: true, type: 'module' }),
    );
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(
      path.join(root, 'src/example.ts'),
      'async function task(): Promise<void> {}\n\ntask();\n',
    );
    fs.writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { target: 'ES2022', module: 'NodeNext' },
        include: ['src'],
      }),
    );
    const configUrl = pathToFileURL(
      path.resolve('dist/configs/eslint.js'),
    ).href;
    fs.writeFileSync(
      path.join(root, 'eslint.config.mjs'),
      `import { createConfig } from ${JSON.stringify(configUrl)};\nexport default createConfig();\n`,
    );
    const result = runLint(
      '--check',
      '--eslint',
      'src',
      '--eslint-config',
      'eslint.config.mjs',
    );
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain(
      '@typescript-eslint/no-floating-promises',
    );
    expect(result.stdout + result.stderr).toContain(
      'Using native TypeScript 7.1.0-beta',
    );
  }, 30000);

  test('supports multiple project roots in one process', () => {
    installCompiler('@typescript/native');
    const other = path.join(root, 'other');
    fs.mkdirSync(path.join(other, 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(other, 'package.json'), '{}');
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { nativeTypeScriptBackend } from ${JSON.stringify(resolverUrl)};
         nativeTypeScriptBackend.configure(${JSON.stringify(root)});
         nativeTypeScriptBackend.configure(${JSON.stringify(other)});`,
      ],
      { cwd: root, encoding: 'utf8' },
    );
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  test('does not redirect a consumer TypeScript import', () => {
    installUnusedCompiler('5.8.3');
    const compiler = path.join(root, 'node_modules/typescript/index.cjs');
    fs.writeFileSync(compiler, "module.exports = { version: 'consumer' };\n");
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { createRequire } from 'node:module';
         import { nativeTypeScriptBackend } from ${JSON.stringify(resolverUrl)};
         nativeTypeScriptBackend.configure(${JSON.stringify(root)});
         const requireProject = createRequire(${JSON.stringify(path.join(root, 'package.json'))});
         console.log(requireProject('typescript').version);`,
      ],
      { cwd: root, encoding: 'utf8' },
    );
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('consumer');
  });

  test('closes one project service without closing another root', () => {
    const other = path.join(root, 'other');
    fs.mkdirSync(other);
    fs.writeFileSync(path.join(other, 'package.json'), '{}');
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import assert from 'node:assert/strict';
         import { nativeTypeScriptBackend as backend } from ${JSON.stringify(resolverUrl)};
         const first = ${JSON.stringify(root)};
         const second = ${JSON.stringify(other)};
         backend.configure(first);
         backend.configure(second);
         const firstService = backend.getProjectService(first);
         const secondService = backend.getProjectService(second);
         backend.closeProject(first);
         assert.throws(() => backend.getProjectService(first), /not configured/);
         assert.equal(backend.getProjectService(second), secondService);
         backend.configure(first);
         assert.notEqual(backend.getProjectService(first), firstService);
         backend.clear();`,
      ],
      { cwd: root, encoding: 'utf8', timeout: 10000 },
    );
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  test('uses referenced project declarations with a TypeScript 7 project', () => {
    installCompiler('@typescript/native');
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'lint-consumer', private: true, type: 'module' }),
    );
    const lib = path.join(root, 'packages/lib');
    const app = path.join(root, 'packages/app');
    fs.mkdirSync(path.join(lib, 'src'), { recursive: true });
    fs.mkdirSync(path.join(app, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(lib, 'src/task.ts'),
      'async function task(): Promise<void> {}\n\nexport { task };\n',
    );
    fs.writeFileSync(
      path.join(lib, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          composite: true,
          rootDir: 'src',
          outDir: 'dist',
        },
        include: ['src'],
      }),
    );
    const lintCompiler = path.dirname(
      require.resolve('@typescript/native/package.json'),
    );
    const built = spawnSync(
      process.execPath,
      [
        path.join(lintCompiler, 'bin/tsc'),
        '-p',
        path.join(lib, 'tsconfig.json'),
      ],
      { cwd: root, encoding: 'utf8', timeout: 30000 },
    );
    expect(built.stdout + built.stderr).toBe('');
    expect(built.status).toBe(0);
    fs.writeFileSync(
      path.join(app, 'src/example.ts'),
      "import { task } from '../../lib/dist/task.js';\n\ntask();\n",
    );
    fs.writeFileSync(
      path.join(app, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          composite: true,
        },
        references: [{ path: '../lib' }],
        include: ['src'],
      }),
    );
    fs.writeFileSync(
      path.join(root, 'matrixai-lint-config.json'),
      JSON.stringify({
        version: 2,
        root: '.',
        domains: {
          eslint: { tsconfigPaths: ['./packages/app/tsconfig.json'] },
        },
      }),
    );
    const result = runLint('--check', '--eslint', 'packages/app/src');
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain(
      '@typescript-eslint/no-floating-promises',
    );
  }, 30000);
});
