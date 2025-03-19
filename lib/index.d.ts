declare const _default: {
    rules: {
        'no-aliased-imports': import("@typescript-eslint/utils/ts-eslint").RuleModule<"noAlias" | "noAliasNoAutofix", [{
            aliases: {
                prefix: string;
                target: string;
            }[];
            includeFolders: string[];
            autoFix: boolean;
        }], unknown, import("@typescript-eslint/utils/ts-eslint").RuleListener>;
    };
    configs: {
        recommended: {
            plugins: string[];
            rules: {
                '@matrixai/no-aliased-imports': (string | {
                    aliases: {
                        prefix: string;
                        target: string;
                    }[];
                    includeFolders: string[];
                    autoFix: boolean;
                })[];
            };
        };
    };
};
export default _default;
//# sourceMappingURL=index.d.ts.map