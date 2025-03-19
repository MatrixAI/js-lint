// src/configs/recommended.ts
export default {
    plugins: ['@matrixai'],
    rules: {
        '@matrixai/no-aliased-imports': ['error', {
                aliases: [{ prefix: '#', target: 'src' }],
                includeFolders: ['src'],
                autoFix: true
            }]
    }
};
//# sourceMappingURL=recommended.js.map