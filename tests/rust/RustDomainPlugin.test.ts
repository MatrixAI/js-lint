import fs from 'node:fs';
import path from 'node:path';
import childProcess from 'node:child_process';
import { jest } from '@jest/globals';
import Logger from '@matrixai/logger';
import RustDomainPlugin from '#rust/RustDomainPlugin.js';

describe('Rust backend', () => {
  let root: string;
  let previous: string;
  const context = {
    fix: true,
    logger: new Logger('rust-test'),
    isConfigValid: true,
  };
  const detection = {
    relevant: true,
    available: true,
    availabilityKind: 'required' as const,
    matchedFiles: ['src/lib.rs'],
  };

  beforeEach(() => {
    previous = process.cwd();
    root = fs.mkdtempSync(path.join(tmpDir, 'rust-'));
    process.chdir(root);
    fs.mkdirSync('src');
    fs.writeFileSync(
      'Cargo.toml',
      '[package]\nname="fixture"\nversion="0.1.0"\nedition="2021"\n',
    );
    fs.writeFileSync('src/lib.rs', 'pub fn value() -> u8 { 1 }\n');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.chdir(previous);
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('fixes selected files without traversing child modules and checks Cargo offline without compiler autofixes', () => {
    const exec = jest
      .spyOn(childProcess, 'execFileSync')
      .mockReturnValue(Buffer.from(''));
    expect(
      new RustDomainPlugin().run(
        { ...context, cargoArgs: ['--features', 'portable-core'] },
        detection,
      ).hadFailure,
    ).toBe(false);
    expect(exec.mock.calls[0]?.[1]).toStrictEqual([
      '--edition',
      '2021',
      '--config',
      'skip_children=true',
      'src/lib.rs',
    ]);
    expect(exec.mock.calls[1]?.[1]).toStrictEqual([
      'clippy',
      '--locked',
      '--offline',
      '--all-targets',
      '--features',
      'portable-core',
      '--',
      '-D',
      'warnings',
    ]);
  });

  test('check mode is non-mutating and explicit policy can disable compiler-backed analysis', () => {
    const exec = jest
      .spyOn(childProcess, 'execFileSync')
      .mockReturnValue(Buffer.from(''));
    expect(
      new RustDomainPlugin().run(
        { ...context, fix: false, rustClippy: false },
        detection,
      ).hadFailure,
    ).toBe(false);
    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec.mock.calls[0]?.[1]).toContain('--check');
  });

  test('residual compiler diagnostics fail the fix workflow', () => {
    jest
      .spyOn(childProcess, 'execFileSync')
      .mockReturnValueOnce(Buffer.from(''))
      .mockImplementationOnce(() => {
        throw new Error('unfixed diagnostic');
      });
    expect(new RustDomainPlugin().run(context, detection).hadFailure).toBe(
      true,
    );
  });
});
