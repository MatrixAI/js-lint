import * as utils from './utils.js';

let cached: string[] | undefined;

export function getProjectConfigs(): string[] {
  if (!cached) cached = utils.findTsconfigFiles();
  return cached;
}
