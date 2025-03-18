export declare const rules: {
    'no-aliased-imports': import("@typescript-eslint/utils/ts-eslint").RuleModule<"noAlias" | "noAliasNoAutofix", [{
        aliases: {
            prefix: string;
            target: string;
        }[];
        includeFolders: string[];
        autoFix: boolean;
    }], unknown, import("@typescript-eslint/utils/ts-eslint").RuleListener>;
};
export declare const configs: {
    recommended: {
        plugins: string[];
        rules: {
            'custom/no-aliased-imports': (string | {
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
//# sourceMappingURL=index.d.ts.map