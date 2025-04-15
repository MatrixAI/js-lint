import noAliasedImportsRule from '../rules/no-aliased-imports.js';

const matrixaiPlugin = {
  meta: {
    name: 'eslint-plugin-matrixai',
    version: '0.0.1',
  },
  rules: {
    'no-aliased-imports': noAliasedImportsRule,
  },
  configs: {},
};

export default matrixaiPlugin;
