import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const project = fileURLToPath(new URL('../../', import.meta.url));
const dependencyRoot =
  process.env.MATRIXAI_LINT_CONSUMER_DEPS ??
  path.join(project, 'tests/eslint/fixtures/tailwind-consumer/node_modules');
const cli =
  process.env.MATRIXAI_LINT_PACKAGED_CLI ??
  path.join(project, 'dist/bin/matrixai-lint.js');
const evidence =
  process.env.MATRIXAI_LINT_PACKAGE_EVIDENCE ??
  path.join(project, 'tmp/package-tailwind');
const root = fs.mkdtempSync(
  path.join(os.tmpdir(), 'matrixai-packaged-tailwind-'),
);
const records = [];
fs.mkdirSync(evidence, { recursive: true });

function write(relative, text) {
  const destination = path.join(root, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, text);
}

function run(
  name,
  { fix = false, target = 'src/Example.tsx', cwd = root } = {},
) {
  const args = [
    '--root',
    root,
    fix ? '--fix' : '--check',
    '--domain',
    'eslint',
    '--eslint',
    target,
  ];
  const result = process.env.MATRIXAI_LINT_PACKAGED_CLI
    ? spawnSync(cli, args, { cwd, encoding: 'utf8', timeout: 60000 })
    : spawnSync(process.execPath, [cli, ...args], {
        cwd,
        encoding: 'utf8',
        timeout: 60000,
      });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  fs.writeFileSync(path.join(evidence, `${name}.log`), log);
  records.push({ name, status: result.status });
  assert.equal(result.error, undefined, `${name}: ${result.error?.message}`);
  assert.doesNotMatch(log, /ENOTDIR/u, log);
  return { ...result, log };
}

function component(classes) {
  write(
    'src/Example.tsx',
    `export function Example() {\n  return <div className="${classes}" />;\n}\n`,
  );
}

function makeWritable(directory) {
  fs.chmodSync(directory, 0o755);
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) makeWritable(file);
    else if (entry.isFile()) fs.chmodSync(file, 0o644);
  }
}

function main() {
  // Only the consumer's own locked dependencies cross this boundary, never the
  // lint tool's node_modules tree. Both directories are real independent trees.
  fs.cpSync(dependencyRoot, path.join(root, 'node_modules'), {
    recursive: true,
  });
  makeWritable(path.join(root, 'node_modules'));
  assert.deepEqual(
    fs
      .readdirSync(path.join(root, 'node_modules'))
      .filter((x) => !x.startsWith('.'))
      .sort(),
    ['tailwindcss', 'typescript'],
  );
  assert.notEqual(fs.realpathSync(path.dirname(cli)), fs.realpathSync(root));
  write(
    'package.json',
    JSON.stringify({
      type: 'module',
      devDependencies: { tailwindcss: '4.3.4', typescript: '5.9.3' },
    }),
  );
  write(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: { jsx: 'preserve', noEmit: true, types: [] },
      include: ['src/**/*'],
    }),
  );
  write(
    'eslint.settings.json',
    JSON.stringify({
      tailwindcss: { cssConfigPath: 'src/ui/styles/tailwind.css' },
    }),
  );
  write(
    'src/ui/styles/tailwind.css',
    '@layer theme, controls, components, utilities;\n@import "tailwindcss/theme.css" layer(theme) prefix(tw);\n@import "tailwindcss/utilities.css" layer(utilities) prefix(tw) source(none);\n@source "../";\n',
  );
  const originalCSS = fs.readFileSync(
    path.join(root, 'src/ui/styles/tailwind.css'),
    'utf8',
  );

  component('tw:p-4 tw:flex');
  const ordering = run('ordering');
  assert.equal(ordering.status, 0, ordering.log);
  assert.match(ordering.log, /tailwindcss\/classnames-order/u);
  assert.match(ordering.log, /Using project Tailwind CSS 4\.3\.4:/u);
  assert.match(
    ordering.log,
    new RegExp(root.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')),
  );
  const fixed = run('ordering-fixed', { fix: true });
  assert.equal(fixed.status, 0, fixed.log);
  assert.match(
    fs.readFileSync(path.join(root, 'src/Example.tsx'), 'utf8'),
    /tw:flex tw:p-4/u,
  );

  component('tw:p-[16px]');
  const arbitrary = run('arbitrary');
  assert.match(arbitrary.log, /tailwindcss\/no-unnecessary-arbitrary-value/u);
  assert.equal(run('arbitrary-fixed', { fix: true }).status, 0);
  assert.match(
    fs.readFileSync(path.join(root, 'src/Example.tsx'), 'utf8'),
    /tw:p-4/u,
  );

  component('tw:flex tw:grid');
  const contradictory = run('contradictory');
  assert.equal(contradictory.status, 1, contradictory.log);
  assert.match(contradictory.log, /tailwindcss\/no-contradicting-classname/u);

  component('tw:flex');
  fs.mkdirSync(path.join(root, 'packages/nested'), { recursive: true });
  const nested = run('nested-invocation', {
    cwd: path.join(root, 'packages/nested'),
  });
  assert.equal(nested.status, 0, nested.log);

  write(
    'src/ui/styles/tailwind.css',
    originalCSS + '@theme { --color-consumer-brand: #123456; }\n',
  );
  component('tw:bg-consumer-brand tw:bg-red-500');
  const theme = run('consumer-theme');
  assert.equal(theme.status, 1, theme.log);
  assert.match(theme.log, /tailwindcss\/no-contradicting-classname/u);

  write(
    'eslint.settings.json',
    '{"tailwindcss":{"cssConfigPath":"absent.css"}}',
  );
  const invalid = run('invalid-entrypoint');
  assert.equal(invalid.status, 1, invalid.log);
  assert.match(invalid.log, /Invalid Tailwind CSS entrypoint/u);
  assert.match(invalid.log, /settings\.tailwindcss\.cssConfigPath/u);
  write(
    'eslint.settings.json',
    '{"tailwindcss":{"cssConfigPath":"src/ui/styles/tailwind.css"}}',
  );

  fs.renameSync(
    path.join(root, 'node_modules/tailwindcss'),
    path.join(root, 'missing-tailwind'),
  );
  const missing = run('missing-dependency');
  assert.equal(missing.status, 1, missing.log);
  assert.match(missing.log, /Install Tailwind CSS v4 in the consumer/u);
  fs.renameSync(
    path.join(root, 'missing-tailwind'),
    path.join(root, 'node_modules/tailwindcss'),
  );

  const manifest = path.join(root, 'node_modules/tailwindcss/package.json');
  const originalManifest = fs.readFileSync(manifest, 'utf8');
  fs.writeFileSync(
    manifest,
    JSON.stringify({ ...JSON.parse(originalManifest), version: '3.4.19' }),
  );
  const v3 = run('unsupported-v3');
  assert.equal(v3.status, 1, v3.log);
  assert.match(v3.log, /Unsupported consumer Tailwind CSS 3\.4\.19/u);
  fs.writeFileSync(manifest, originalManifest);

  write(
    'src/ui/styles/tailwind.css',
    '@import "missing-consumer-theme.css";\n',
  );
  const broken = run('broken-css-import');
  assert.equal(broken.status, 1, broken.log);
  assert.match(broken.log, /missing-consumer-theme\.css/u);
  assert.match(broken.log, /Tailwind lint initialization failed/u);

  fs.rmSync(path.join(root, 'node_modules/tailwindcss'), { recursive: true });
  fs.rmSync(path.join(root, 'eslint.settings.json'));
  fs.rmSync(path.join(root, 'src/ui/styles/tailwind.css'));
  write(
    'package.json',
    '{"type":"module","devDependencies":{"typescript":"5.9.3"}}',
  );
  write('src/Example.tsx', 'console.log("ordinary consumer");\n');
  const ordinary = run('non-tailwind');
  assert.equal(ordinary.status, 1, ordinary.log);
  assert.match(ordinary.log, /no-console/u);
  assert.doesNotMatch(
    ordinary.log,
    /Tailwind lint initialization failed|requires the consumer's tailwindcss/u,
  );

  fs.writeFileSync(
    path.join(evidence, 'report.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        name: 'package-tailwind',
        kind: 'package-test',
        status: 'passed',
        system: process.env.CHECK_SYSTEM ?? process.platform,
        summary:
          'Separately installed CLI, consumer Tailwind 4.3.4, no-Preflight CSS, diagnostics and autofixes passed',
        artifacts: { scenarios: 'scenarios.json' },
      },
      null,
      2,
    ) + '\n',
  );
  fs.writeFileSync(
    path.join(evidence, 'scenarios.json'),
    JSON.stringify(
      {
        cli,
        consumerDependencies: dependencyRoot,
        tailwind: '4.3.4',
        scenarios: records,
      },
      null,
      2,
    ) + '\n',
  );
  // eslint-disable-next-line no-console
  console.log(
    `Packaged Tailwind verification passed: ${records.length} scenarios; evidence ${evidence}`,
  );
}

try {
  main();
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
