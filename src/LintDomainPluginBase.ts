import type {
  LintDomain,
  LintDomainDetection,
  LintDomainEngineContext,
  LintDomainPlugin,
  LintDomainPluginResult,
} from './types.js';

function normalizeLogDetail(value: unknown): string {
  return String(value)
    .replace(/\r?\n+/g, ' | ')
    .trim();
}

abstract class LintDomainPluginBase implements LintDomainPlugin {
  public abstract readonly domain: LintDomain;
  public abstract readonly description: string;

  public abstract detect(
    context: LintDomainEngineContext,
  ): Promise<LintDomainDetection> | LintDomainDetection;

  public abstract run(
    context: LintDomainEngineContext,
    detection: LintDomainDetection,
  ): Promise<LintDomainPluginResult> | LintDomainPluginResult;

  protected normalizeLogDetail(value: unknown): string {
    return normalizeLogDetail(value);
  }
}

export default LintDomainPluginBase;
