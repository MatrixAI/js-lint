import type { RuleModule } from '@typescript-eslint/utils/ts-eslint';
export declare const noAliasedImportsRule: RuleModule<'noAlias' | 'noAliasNoAutofix', [
    {
        aliases: {
            prefix: string;
            target: string;
        }[];
        includeFolders: string[];
        autoFix: boolean;
    }
]>;
export default noAliasedImportsRule;
//# sourceMappingURL=no-aliased-imports.d.ts.map