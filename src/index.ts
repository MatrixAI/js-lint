import noAliasedImportsRule from './rules/no-aliased-imports.js';
import { recommended } from './configs/recommended.js';

const matrixaiPlugin = {
  meta: {
    name: 'eslint-plugin-matrixai',
    version: '0.0.1',
  },
  rules: {
    'no-aliased-imports': noAliasedImportsRule,
  },
  configs: {
    recommended: recommended,
  },
};

// Add the plugin to the recommended config so it can automatically get a reference to the plugin
// when the user applies the recommended config.
Object.assign(recommended.plugins, {
  '@matrixai': matrixaiPlugin,
});

export default matrixaiPlugin;
