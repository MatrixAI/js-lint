import { noAliasedImportsRule } from './rules/no-aliased-imports.js';
export const rules = {
    'no-aliased-imports': noAliasedImportsRule
};
export const configs = {
    recommended: {
        plugins: ['custom'],
        rules: {
            'custom/no-aliased-imports': ['error', {
                    aliases: [{ prefix: '#', target: 'src' }],
                    includeFolders: ['src'],
                    autoFix: false
                }]
        }
    }
};
//# sourceMappingURL=index.js.map