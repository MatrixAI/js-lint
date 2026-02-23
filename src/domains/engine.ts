import type { LintDomain } from '../types.js';
import type Logger from '@matrixai/logger';

type LintDomainEngineContext = {
  fix: boolean;
  logger: Logger;
  chosenConfig?: string;
  isConfigValid: boolean;
  eslintPatterns?: string[];
  shellPatterns?: string[];
  markdownPatterns?: string[];
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

type LintDomainSelectionSource =
  | 'default'
  | 'domain-flag'
  | 'target-flag'
  | 'unselected';

type LintDomainPlannedAction =
  | 'run'
  | 'skip-unselected'
  | 'skip-not-relevant'
  | 'skip-unavailable'
  | 'fail-unavailable'
  | 'fail-detection';

type LintDomainDecision = {
  domain: LintDomain;
  description: string;
  selected: boolean;
  explicitlyRequested: boolean;
  selectionSource: LintDomainSelectionSource;
  detection: LintDomainDetection | null;
  plannedAction: LintDomainPlannedAction;
  detectionError?: string;
};

type LintDomainPlugin = {
  domain: LintDomain;
  description: string;
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

function normalizeLogDetail(value: unknown): string {
  return String(value)
    .replace(/\r?\n+/g, ' | ')
    .trim();
}

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

function listLintDomains({
  registry,
  executionOrder,
}: {
  registry: ReadonlyMap<LintDomain, LintDomainPlugin>;
  executionOrder: readonly LintDomain[];
}): Array<{ domain: LintDomain; description: string }> {
  return executionOrder.map((domain) => {
    const plugin = registry.get(domain);
    if (plugin == null) {
      throw new Error(`No lint domain plugin registered for: ${domain}`);
    }

    return {
      domain,
      description: plugin.description,
    };
  });
}

async function evaluateLintDomains({
  registry,
  selectedDomains,
  explicitlyRequestedDomains,
  selectionSources,
  executionOrder,
  context,
}: {
  registry: ReadonlyMap<LintDomain, LintDomainPlugin>;
  selectedDomains: ReadonlySet<LintDomain>;
  explicitlyRequestedDomains: ReadonlySet<LintDomain>;
  selectionSources?: ReadonlyMap<LintDomain, LintDomainSelectionSource>;
  executionOrder: readonly LintDomain[];
  context: LintDomainEngineContext;
}): Promise<LintDomainDecision[]> {
  const decisions: LintDomainDecision[] = [];

  for (const domain of executionOrder) {
    const plugin = registry.get(domain);
    if (plugin == null) {
      throw new Error(`No lint domain plugin registered for: ${domain}`);
    }

    const selected = selectedDomains.has(domain);
    const explicitlyRequested = explicitlyRequestedDomains.has(domain);
    const selectionSource =
      selectionSources?.get(domain) ?? (selected ? 'default' : 'unselected');

    if (!selected) {
      decisions.push({
        domain,
        description: plugin.description,
        selected,
        explicitlyRequested,
        selectionSource,
        detection: null,
        plannedAction: 'skip-unselected',
      });
      continue;
    }

    try {
      const detection = await plugin.detect(context);
      let plannedAction: LintDomainPlannedAction;

      if (!detection.relevant) {
        plannedAction = 'skip-not-relevant';
      } else if (!detection.available) {
        const shouldFail =
          detection.availabilityKind === 'required' || explicitlyRequested;
        plannedAction = shouldFail ? 'fail-unavailable' : 'skip-unavailable';
      } else {
        plannedAction = 'run';
      }

      decisions.push({
        domain,
        description: plugin.description,
        selected,
        explicitlyRequested,
        selectionSource,
        detection,
        plannedAction,
      });
    } catch (err) {
      decisions.push({
        domain,
        description: plugin.description,
        selected,
        explicitlyRequested,
        selectionSource,
        detection: null,
        plannedAction: 'fail-detection',
        detectionError: String(err),
      });
    }
  }

  return decisions;
}

async function runLintDomainDecisions({
  registry,
  decisions,
  context,
}: {
  registry: ReadonlyMap<LintDomain, LintDomainPlugin>;
  decisions: readonly LintDomainDecision[];
  context: LintDomainEngineContext;
}): Promise<boolean> {
  let hadFailure = false;
  const logger = context.logger;

  for (const decision of decisions) {
    const {
      domain,
      plannedAction,
      explicitlyRequested,
      detection,
      detectionError,
    } = decision;

    if (plannedAction === 'skip-unselected') {
      continue;
    }

    if (plannedAction === 'fail-detection') {
      const message = `[matrixai-lint] - Domain "${domain}" failed unexpectedly. ${normalizeLogDetail(detectionError ?? 'Unknown detection error.')}`;
      logger.error(message);
      hadFailure = true;
      continue;
    }

    if (plannedAction === 'skip-not-relevant') {
      if (explicitlyRequested) {
        const relevanceReason =
          detection?.relevanceReason ?? 'No files matched in effective scope.';
        const message = `[matrixai-lint] - Domain "${domain}" was explicitly requested, but no files matched. ${relevanceReason}`;
        logger.warn(message);
      }
      continue;
    }

    if (plannedAction === 'fail-unavailable') {
      const unavailableReason =
        detection?.unavailableReason ??
        `Tooling for domain "${domain}" is not available.`;
      const message = `[matrixai-lint] - Domain "${domain}" cannot run. ${unavailableReason}`;
      logger.error(message);
      hadFailure = true;
      continue;
    }

    if (plannedAction === 'skip-unavailable') {
      const unavailableReason =
        detection?.unavailableReason ??
        `Tooling for domain "${domain}" is not available.`;
      const message = `[matrixai-lint] - Domain "${domain}" skipped. ${unavailableReason}`;
      logger.warn(message);
      continue;
    }

    const plugin = registry.get(domain);
    if (plugin == null) {
      throw new Error(`No lint domain plugin registered for: ${domain}`);
    }

    if (detection == null) {
      const message = `[matrixai-lint] - Domain "${domain}" is missing detection metadata.`;
      logger.error(message);
      hadFailure = true;
      continue;
    }

    try {
      const result = await plugin.run(context, detection);
      if (result.hadFailure) {
        hadFailure = true;
      }
    } catch (err) {
      const message = `[matrixai-lint] - Domain "${domain}" failed unexpectedly. ${normalizeLogDetail(err)}`;
      logger.error(message);
      hadFailure = true;
    }
  }

  return hadFailure;
}

async function runLintDomains({
  registry,
  selectedDomains,
  explicitlyRequestedDomains,
  selectionSources,
  executionOrder,
  context,
}: {
  registry: ReadonlyMap<LintDomain, LintDomainPlugin>;
  selectedDomains: ReadonlySet<LintDomain>;
  explicitlyRequestedDomains: ReadonlySet<LintDomain>;
  selectionSources?: ReadonlyMap<LintDomain, LintDomainSelectionSource>;
  executionOrder: readonly LintDomain[];
  context: LintDomainEngineContext;
}): Promise<boolean> {
  const decisions = await evaluateLintDomains({
    registry,
    selectedDomains,
    explicitlyRequestedDomains,
    selectionSources,
    executionOrder,
    context,
  });

  return await runLintDomainDecisions({
    registry,
    decisions,
    context,
  });
}

export type {
  LintDomainDecision,
  LintDomainPlannedAction,
  LintDomainSelectionSource,
  LintDomainAvailabilityKind,
  LintDomainDetection,
  LintDomainEngineContext,
  LintDomainPlugin,
  LintDomainPluginResult,
};
export {
  createLintDomainRegistry,
  listLintDomains,
  evaluateLintDomains,
  runLintDomainDecisions,
  runLintDomains,
};
