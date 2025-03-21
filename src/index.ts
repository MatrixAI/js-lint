import noAliasedImportsRule from './rules/no-aliased-imports.js';
import { recommended } from './configs/recommended.js';

export const plugin = {
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

Object.assign(plugin.configs, {
  recommended: recommended,
});

export default plugin;
