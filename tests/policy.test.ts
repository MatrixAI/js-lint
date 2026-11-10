import type { CLIOptions } from '#types.js';
import fs from 'node:fs';
import path from 'node:path';
import childProcess from 'node:child_process';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { resolveLintConfig } from '#config.js';
import { resolveExecutionPolicy } from '#policy.js';
import { resolveDomainSelection } from '#domains.js';
import main from '#bin/matrixai-lint.js';

describe('layered execution policy', () => {
  let root: string;
  let previous: string;
  const defaults: CLIOptions = { fix: false, userConfig: false };

  beforeEach(() => {
    previous = process.cwd();
    root = fs.mkdtempSync(path.join(tmpDir, 'policy-'));
    process.chdir(root);
    for (const dir of ['docs', 'extra', 'invocation']) {
      fs.mkdirSync(dir);
      fs.writeFileSync(`${dir}/guide.md`, '# Guide\n');
    }
    fs.writeFileSync('README.md', '# Readme\n');
  });

  afterEach(() => {
    process.chdir(previous);
    fs.rmSync(root, { recursive: true, force: true });
  });

  function resolve(options = defaults) {
    return resolveExecutionPolicy(
      resolveLintConfig(root),
      options,
      resolveDomainSelection(options).selectedDomains,
    );
  }

  test('repository extension retains defaults, CLI extension remains additive, and exclusions subtract', () => {
    fs.writeFileSync(
      'matrixai-lint-config.json',
      JSON.stringify({
        version: 2,
        domains: {
          markdown: { extendTargets: ['extra'], excludeTargets: ['README.md'] },
        },
      }),
    );
    const policy = resolve({
      ...defaults,
      extendTarget: ['markdown=invocation'],
    });
    expect(policy.markdown.files).toStrictEqual([
      'docs/guide.md',
      'extra/guide.md',
      'invocation/guide.md',
    ]);
    expect(policy.nix.enabled).toBe(true);
    expect(policy.markdown.provenance).toStrictEqual([
      'defaults',
      'repository.extendTargets',
      'cli.extendTarget',
    ]);
  });

  test('CLI replacement and targeting do not inject root Markdown files', () => {
    expect(
      resolve({ ...defaults, markdown: ['docs'] }).markdown.files,
    ).toStrictEqual(['docs/guide.md']);
    expect(
      resolve({ ...defaults, replaceTarget: ['markdown=extra'] }).markdown
        .files,
    ).toStrictEqual(['extra/guide.md']);
  });

  test('an explicit empty replacement does not fall back to discovery', () => {
    fs.writeFileSync(
      'matrixai-lint-config.json',
      JSON.stringify({
        version: 2,
        domains: { markdown: { replaceTargets: [] } },
      }),
    );
    expect(resolve().markdown.files).toStrictEqual([]);
    fs.writeFileSync(
      'matrixai-lint-config.json',
      JSON.stringify({ version: 2 }),
    );
    expect(
      resolve({ ...defaults, replaceTarget: ['markdown='] }).markdown.files,
    ).toStrictEqual([]);
  });

  test('repository disablement and CLI exclusions apply without changing unrelated domains', () => {
    fs.writeFileSync(
      'matrixai-lint-config.json',
      JSON.stringify({ version: 2, domains: { markdown: { enabled: false } } }),
    );
    expect(resolve().markdown.enabled).toBe(false);
    expect(resolve().nix.enabled).toBe(true);
    expect(
      resolve({ ...defaults, domain: ['markdown'] }).markdown.enabled,
    ).toBe(true);
    fs.writeFileSync(
      'matrixai-lint-config.json',
      JSON.stringify({ version: 2 }),
    );
    expect(
      resolve({
        ...defaults,
        markdown: ['docs'],
        excludeTarget: ['markdown=docs'],
      }).markdown.files,
    ).toStrictEqual([]);
  });

  test('invalid operations and mistyped additions fail instead of silently falling back', () => {
    expect(() =>
      resolve({ ...defaults, extendTarget: ['unknown=docs'] }),
    ).toThrow('domain=target');
    fs.writeFileSync(
      'matrixai-lint-config.json',
      JSON.stringify({
        version: 2,
        domains: { markdown: { extendTargets: 'docs' } },
      }),
    );
    expect(() => resolve()).toThrow('array of strings');
  });

  test('plan mode never applies fixes or writes a report and restores the caller directory', async () => {
    fs.writeFileSync(
      'matrixai-lint-config.json',
      JSON.stringify({ version: 2 }),
    );
    fs.writeFileSync('docs/guide.md', '#   Unformatted\n');
    const before = fs.readFileSync('docs/guide.md', 'utf8');
    await main([
      'node',
      'matrixai-lint',
      '--root',
      root,
      '--fix',
      '--plan',
      '--markdown',
      'docs',
      '--report',
      'unexpected.json',
    ]);
    expect(fs.readFileSync('docs/guide.md', 'utf8')).toBe(before);
    expect(fs.existsSync('unexpected.json')).toBe(false);
    expect(process.cwd()).toBe(root);
  });

  test('conflicting modes are rejected', async () => {
    await expect(
      main(['node', 'matrixai-lint', '--fix', '--check']),
    ).rejects.toThrow('mutually exclusive');
  });

  test('real Markdown check is non-mutating, fix is idempotent, and reports identify the executed scope', () => {
    fs.writeFileSync(
      'matrixai-lint-config.json',
      JSON.stringify({ version: 2 }),
    );
    fs.writeFileSync('docs/guide.md', '#   Needs formatting\n');
    const entrypoint = path.join(previous, 'dist/bin/matrixai-lint.js');
    const args = [entrypoint, '--root', root, '--markdown', 'docs'];
    const before = fs.readFileSync('docs/guide.md', 'utf8');
    expect(
      childProcess.spawnSync(process.execPath, [...args, '--check']).status,
    ).toBe(1);
    expect(fs.readFileSync('docs/guide.md', 'utf8')).toBe(before);
    expect(
      childProcess.spawnSync(process.execPath, [
        ...args,
        '--fix',
        '--report',
        'tmp/report.json',
      ]).status,
    ).toBe(0);
    const fixed = fs.readFileSync('docs/guide.md', 'utf8');
    expect(fixed).not.toBe(before);
    expect(
      childProcess.spawnSync(process.execPath, [...args, '--fix']).status,
    ).toBe(0);
    expect(fs.readFileSync('docs/guide.md', 'utf8')).toBe(fixed);
    const report = JSON.parse(fs.readFileSync('tmp/report.json', 'utf8')) as {
      status: string;
      policy: { markdown: { files: string[] } };
    };
    expect(report.status).toBe('passed');
    expect(report.policy.markdown.files).toStrictEqual(['docs/guide.md']);
  });
});
