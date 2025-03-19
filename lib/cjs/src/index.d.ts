declare const plugin: {
    meta: {
        name: string;
        version: string;
    };
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
            rules: {
                "@matrixai/no-aliased-imports": (string | {
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
export default plugin;
//# sourceMappingURL=index.d.ts.map