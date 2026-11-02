import { configureProjectTypeScript } from '../projectTypeScript.js';

// Select the consumer's compiler before loading parser/plugin dependencies.
configureProjectTypeScript();
const {
  default: config,
  createConfig,
  createEslintConfig,
} = await import('./eslintConfig.js');

export default config;
export { createConfig, createEslintConfig };
