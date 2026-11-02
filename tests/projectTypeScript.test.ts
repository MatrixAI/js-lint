import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const resolverUrl = pathToFileURL(
  path.resolve('dist/projectTypeScript.js'),
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

  function fakeCompiler(version: string): string {
    const directory = path.join(root, 'node_modules/typescript');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      path.join(directory, 'package.json'),
      JSON.stringify({ name: 'typescript', version, main: 'index.cjs' }),
    );
    const entry = path.join(directory, 'index.cjs');
    fs.writeFileSync(entry, `module.exports = { version: '${version}' };\n`);
    return entry;
  }

  test('selects the consumer compiler for backend CommonJS imports too', () => {
    const entry = fakeCompiler('5.9.3');
    const result = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { createRequire } from 'node:module';
         import { configureProjectTypeScript } from ${JSON.stringify(resolverUrl)};
         const selected = configureProjectTypeScript(${JSON.stringify(root)});
         const backendRequire = createRequire(${JSON.stringify(pathToFileURL(path.resolve('package.json')).href)});
         console.log(JSON.stringify({ path: selected.path, same: backendRequire('typescript') === selected.api }));`,
      ],
      { cwd: root, encoding: 'utf8' },
    );
    expect(JSON.parse(result)).toStrictEqual({ path: entry, same: true });
  });

  test('fails clearly rather than falling back to the tool compiler', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { resolveProjectTypeScript } from ${JSON.stringify(resolverUrl)};
         resolveProjectTypeScript(${JSON.stringify(root)});`,
      ],
      { cwd: root, encoding: 'utf8' },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('does not supply a fallback compiler');
  });

  test('rejects a project compiler outside the parser supported range', () => {
    fakeCompiler('0.0.0');
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { resolveProjectTypeScript } from ${JSON.stringify(resolverUrl)};
         resolveProjectTypeScript(${JSON.stringify(root)});`,
      ],
      { cwd: root, encoding: 'utf8' },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('unsupported by the lint parser');
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

  test('typed ESLint uses the consumer compiler without launching its CLI', () => {
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
    expect(evidence.projectTypeScript.path).toBe(require.resolve('typescript'));
    expect(evidence.status).toBe('passed');
  });
});
