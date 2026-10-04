import path from 'node:path';
import { resolveConfigFile } from 'prettier';

async function resolvePrettierConfigArgs(
  files: readonly string[],
  builtinConfigPath: string,
): Promise<string[]> {
  const discoveredConfigs = await Promise.all(
    files.map((file) => resolveConfigFile(path.resolve(file))),
  );

  if (discoveredConfigs.some((configPath) => configPath != null)) {
    return [];
  }

  return ['--config', builtinConfigPath, '--config-precedence', 'cli-override'];
}

export { resolvePrettierConfigArgs };
