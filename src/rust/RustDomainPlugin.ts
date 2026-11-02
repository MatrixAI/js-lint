import type {
  LintDomainDetection,
  LintDomainEngineContext,
  LintDomainPluginResult,
} from '../types.js';
import fs from 'node:fs';
import childProcess from 'node:child_process';
import LintDomainPluginBase from '../LintDomainPluginBase.js';
import { commandExists, resolveFilesFromPatterns } from '../utils.js';
import { DEFAULT_RUST_SEARCH_PATTERNS } from '../constants.js';

class RustDomainPlugin extends LintDomainPluginBase {
  public readonly domain = 'rust';
  public readonly description =
    'Format Rust files and check the owning Cargo package with Clippy.';

  public detect({
    rustPatterns,
    rustClippy,
  }: LintDomainEngineContext): LintDomainDetection {
    const files = resolveFilesFromPatterns(
      rustPatterns ?? DEFAULT_RUST_SEARCH_PATTERNS,
      ['.rs'],
    );
    const hasManifest = fs.existsSync('Cargo.toml');
    const available =
      commandExists('rustfmt') &&
      (rustClippy === false ||
        (commandExists('cargo') && commandExists('cargo-clippy')));
    return {
      relevant: hasManifest && files.length > 0,
      relevanceReason: !hasManifest
        ? 'No Cargo manifest in the project root.'
        : files.length === 0
          ? 'No Rust files matched.'
          : undefined,
      available,
      availabilityKind: 'required',
      unavailableReason: available
        ? undefined
        : 'Rust requires rustfmt, cargo, and cargo-clippy in the declared tool environment.',
      matchedFiles: files,
    };
  }

  public run(
    { fix, logger, rustClippy, cargoArgs }: LintDomainEngineContext,
    detection: LintDomainDetection,
  ): LintDomainPluginResult {
    const files = detection.matchedFiles ?? [];
    if (files.length === 0) return { hadFailure: false };
    try {
      const manifest = fs.readFileSync('Cargo.toml', 'utf8');
      const edition = manifest.match(
        /^\s*edition\s*=\s*"(2015|2018|2021|2024)"/m,
      )?.[1];
      if (edition === undefined) {
        throw new Error(
          'Declare an explicit Cargo package edition before file-scoped Rust formatting.',
        );
      }
      const args = [
        '--edition',
        edition,
        '--config',
        'skip_children=true',
        ...(!fix ? ['--check'] : []),
        ...files,
      ];
      logger.info(`Rust formatting scope: ${files.join(', ')}`);
      childProcess.execFileSync('rustfmt', args, { stdio: 'inherit' });
      if (rustClippy !== false) {
        logger.info(
          'Rust analysis scope expands to the owning Cargo package and its selected targets/features; Clippy never applies compiler fixes.',
        );
        childProcess.execFileSync(
          'cargo',
          [
            'clippy',
            '--locked',
            '--offline',
            '--all-targets',
            ...(cargoArgs ?? []),
            '--',
            '-D',
            'warnings',
          ],
          { stdio: 'inherit' },
        );
      }
      return { hadFailure: false };
    } catch (error) {
      logger.error(`Rust lint failed: ${this.normalizeLogDetail(error)}`);
      return { hadFailure: true };
    }
  }
}

export default RustDomainPlugin;
