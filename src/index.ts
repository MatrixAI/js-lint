// src/index.ts
import noAliasedImportsRule from './rules/no-aliased-imports.js';
import recommended from './configs/recommended.js';

export default {
  rules: {
    'no-aliased-imports': noAliasedImportsRule
  },
  configs: {
    recommended
  }
};