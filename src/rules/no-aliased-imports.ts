import path from 'node:path';

export const noAliasedImportsRule = {
  meta: {
    type: 'suggestion',
    fixable: 'code',
    hasSuggestions: true,
    schema: [
      {
        type: 'object',
        properties: {
          // We'll allow multiple alias mappings
          aliases: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                prefix: { type: 'string' },
                target: { type: 'string' },
              },
              required: ['prefix', 'target'],
            },
            default: [{ prefix: '#', target: 'src' }],
          },
          // Folders or partial strings that the filename must include
          // in order for us to apply the rule
          includeFolders: {
            type: 'array',
            items: { type: 'string' },
            default: ['src'],
          },
          autoFix: {
            type: 'boolean',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noAlias:
        'Use relative import instead of alias import in src files "{{ aliasImport }}".',
      noAliasNoAutofix:
        'Use relative import instead of alias import in src files "{{ aliasImport }}" (auto-fix is disabled - enable in config if desired.)',
    },
  },
  // Provide defaults if none are given
  defaultOptions: [
    {
      aliases: [{ prefix: '#', target: 'src' }],
      includeFolders: ['src'],
      autoFix: true,
    },
  ],
  create(context) {
    const options = context.options[0] || {};
    const { 
      aliases , 
      includeFolders, 
      autoFix 
    } = options;
    return {
      ImportDeclaration(node) {
        const importPath = node.source.value;

        // The absolute path of the current file being linted
        const filename = context.getFilename();

        // 1) Check if the file is in one of the "includeFolders"
        const isInIncludedFolder = includeFolders.some((folder) => {
          return (
            filename.includes(`${path.sep}${folder}${path.sep}`) ||
            filename.endsWith(`${path.sep}${folder}`)
          );
          // ^ endsWith check so that if 'src' is the last part of the path, it still matches
        });

        // File is not in any of the included folders, so skip
        if (!isInIncludedFolder) {
          return;
        }

        // 2) Check if the import path starts with any of the alias prefixes
        const matchedAlias = aliases.find((aliasObj) =>
          importPath.startsWith(aliasObj.prefix),
        );

        // Doesn't match any alias prefix, so skip
        if (matchedAlias == null) {
          return;
        }

        // For example: prefix = '#' => target = 'src'
        const { prefix, target } = matchedAlias;

        // LocalPart is the substring after the alias prefix
        // e.g. `#db/utils.js` => `db/utils.js`
        const localPart = importPath.slice(prefix.length);

        // 3) Build the absolute path to the *real* file
        // e.g. => <PROJECT_ROOT>/src/db/utils.js
        // or if alias is { prefix: '@', target: 'lib' } => <PROJECT_ROOT>/lib/db/utils.js
        const projectRoot = context.cwd;
        const absoluteImportPath = path.join(projectRoot, target, localPart);

        // 4) Compute the relative path from the current file
        const currentFileDir = path.dirname(filename);

        let relativePath = path.relative(currentFileDir, absoluteImportPath);
        if (!relativePath.startsWith('.')) {
          relativePath = `.${path.sep}${relativePath}`;
        }
        // If autoFix is false, don't give a fix - forces manual fix.
        const fix = autoFix
          ? (fixer) => {
              return fixer.replaceTextRange(
                [node.source.range[0], node.source.range[1]],
                `'${relativePath}'`,
              );
            }
          : null;

        context.report({
          node: node.source,
          messageId: autoFix ? 'noAlias' : 'noAliasNoAutofix',
          data: { aliasImport: importPath },
          fix,
        });
      },
    };
  },
};
