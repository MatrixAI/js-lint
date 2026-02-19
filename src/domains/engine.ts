import type { LintDomain } from '../types.js';

type LintDomainEngineContext = {
  fix: boolean;
  chosenConfig?: string;
  isConfigValid: boolean;
  eslintPatterns?: string[];
  shellPatterns?: string[];
};

type LintDomainAvailabilityKind = 'required' | 'optional';

type LintDomainDetection = {
  relevant: boolean;
  relevanceReason?: string;
  available: boolean;
  availabilityKind: LintDomainAvailabilityKind;
  unavailableReason?: string;
  matchedFiles?: string[];
};

type LintDomainPluginResult = {
  hadFailure: boolean;
};

type LintDomainPlugin = {
  domain: LintDomain;
  detect:
    | ((context: LintDomainEngineContext) => Promise<LintDomainDetection>)
    | ((context: LintDomainEngineContext) => LintDomainDetection);
  run:
    | ((
        context: LintDomainEngineContext,
        detection: LintDomainDetection,
      ) => Promise<LintDomainPluginResult>)
    | ((
        context: LintDomainEngineContext,
        detection: LintDomainDetection,
      ) => LintDomainPluginResult);
};

function createLintDomainRegistry(
  plugins: readonly LintDomainPlugin[],
): Map<LintDomain, LintDomainPlugin> {
  const registry = new Map<LintDomain, LintDomainPlugin>();

  for (const plugin of plugins) {
    if (registry.has(plugin.domain)) {
      throw new Error(
        `Duplicate lint domain plugin registration: ${plugin.domain}`,
      );
    }
    registry.set(plugin.domain, plugin);
  }

  return registry;
}

async function runLintDomains({
  registry,
  selectedDomains,
  explicitlyRequestedDomains,
  executionOrder,
  context,
}: {
  registry: ReadonlyMap<LintDomain, LintDomainPlugin>;
  selectedDomains: ReadonlySet<LintDomain>;
  explicitlyRequestedDomains: ReadonlySet<LintDomain>;
  executionOrder: readonly LintDomain[];
  context: LintDomainEngineContext;
}): Promise<boolean> {
  let hadFailure = false;

  /* eslint-disable no-console */
  for (const domain of executionOrder) {
    if (!selectedDomains.has(domain)) {
      continue;
    }

    const plugin = registry.get(domain);
    if (plugin == null) {
      throw new Error(`No lint domain plugin registered for: ${domain}`);
    }

    try {
      const detection = await plugin.detect(context);
      const explicitlyRequested = explicitlyRequestedDomains.has(domain);

      if (!detection.relevant) {
        if (explicitlyRequested) {
          const relevanceReason =
            detection.relevanceReason ?? 'No files matched in effective scope.';
          console.warn(
            `[matrixai-lint]  -  Domain "${domain}" was explicitly requested, but no files matched. ${relevanceReason}`,
          );
        }
        continue;
      }

      if (!detection.available) {
        const unavailableReason =
          detection.unavailableReason ??
          `Tooling for domain "${domain}" is not available.`;
        const shouldFail =
          detection.availabilityKind === 'required' || explicitlyRequested;

        if (shouldFail) {
          console.error(
            `[matrixai-lint]  -  Domain "${domain}" cannot run. ${unavailableReason}`,
          );
          hadFailure = true;
        } else {
          console.warn(
            `[matrixai-lint]  -  Domain "${domain}" skipped. ${unavailableReason}`,
          );
        }
        continue;
      }

      const result = await plugin.run(context, detection);
      if (result.hadFailure) {
        hadFailure = true;
      }
    } catch (err) {
      console.error(
        `[matrixai-lint]  -  Domain "${domain}" failed unexpectedly.\n${String(err)}`,
      );
      hadFailure = true;
    }
  }
  /* eslint-enable no-console */

  return hadFailure;
}

export type {
  LintDomainAvailabilityKind,
  LintDomainDetection,
  LintDomainEngineContext,
  LintDomainPlugin,
  LintDomainPluginResult,
};
export { createLintDomainRegistry, runLintDomains };
