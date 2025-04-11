import type { EcmaVersion } from '@typescript-eslint/utils/ts-eslint';
import path from 'path';
import { fileURLToPath } from 'url';
import globals from 'globals';
import _import from 'eslint-plugin-import';
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import { FlatCompat } from '@eslint/eslintrc';
import { fixupPluginRules } from '@eslint/compat';
import matrixaiPlugin from '@matrixai/lint';

// eslint-disable-next-line @typescript-eslint/naming-convention
const __filename = fileURLToPath(import.meta.url);
// eslint-disable-next-line @typescript-eslint/naming-convention
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

const config = [
  ...compat.extends(
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:tailwindcss/recommended',
    'plugin:jsx-a11y/recommended',
  ),
  {
    plugins: {
      import: fixupPluginRules(_import),
      '@matrixai': matrixaiPlugin,
    },

    settings: {
      react: {
        version: 'detect',
      },
    },

    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.commonjs,
        ...globals.node,
        ...globals.jest,
      },
      parser: tsParser,
      ecmaVersion: 5 as EcmaVersion,
      sourceType: 'module',
      parserOptions: {
        project: true,
      },
    },
    rules: {
      // React rules
      'react/react-in-jsx-scope': 0,
      'react/no-unknown-property': 'off',
      'react/button-has-type': 'error',
      'react/no-unused-prop-types': 'error',
      'react/jsx-pascal-case': 'error',
      'react/jsx-no-script-url': 'error',
      'react/no-children-prop': 'error',
      'react/no-danger': 'error',
      'react/no-danger-with-children': 'error',
      'react/no-unstable-nested-components': ['error', { allowAsProps: true }],
      'react/jsx-fragments': 'error',
      'react/destructuring-assignment': [
        'error',
        'always',
        { destructureInSignature: 'always' },
      ],
      'react/jsx-no-leaked-render': ['error', { validStrategies: ['ternary'] }],
      'react/function-component-definition': [
        'warn',
        { namedComponents: 'arrow-function' },
      ],
      'react/jsx-key': [
        'error',
        {
          checkFragmentShorthand: true,
          checkKeyMustBeforeSpread: true,
          warnOnDuplicates: true,
        },
      ],
      'react/jsx-no-useless-fragment': 'warn',
      'react/jsx-curly-brace-presence': 'warn',
      'react/no-typos': 'warn',
      'react/display-name': 'warn',
      'react/jsx-sort-props': 'warn',
      'react/jsx-one-expression-per-line': 'off',
      'react/prop-types': 'off',

      '@matrixai/no-aliased-imports': [
        'error',
        {
          aliases: [{ prefix: '#', target: 'src' }],
          includeFolders: ['src'],
          autoFix: true,
        },
      ],
      '@typescript-eslint/no-floating-promises': [
        'error',
        {
          ignoreVoid: true,
          ignoreIIFE: true,
        },
      ],
      '@typescript-eslint/no-misused-promises': [
        'error',
        {
          checksVoidReturn: false,
        },
      ],
      '@typescript-eslint/await-thenable': ['error'],

      'linebreak-style': ['error', 'unix'],
      'no-empty': 1,
      'no-useless-catch': 1,
      'no-prototype-builtins': 1,
      'no-constant-condition': 0,
      'no-useless-escape': 0,
      'no-console': 'error',
      'no-restricted-globals': [
        'error',
        {
          name: 'global',
          message: 'Use `globalThis` instead',
        },
        {
          name: 'window',
          message: 'Use `globalThis` instead',
        },
      ],
      'prefer-rest-params': 0,
      'require-yield': 0,
      eqeqeq: ['error', 'smart'],
      'spaced-comment': [
        'warn',
        'always',
        {
          line: {
            exceptions: ['-'],
          },
          block: {
            exceptions: ['*'],
          },
          markers: ['/'],
        },
      ],
      'capitalized-comments': [
        'warn',
        'always',
        {
          ignoreInlineComments: true,
          ignoreConsecutiveComments: true,
        },
      ],
      curly: ['error', 'multi-line', 'consistent'],
      'import/order': [
        'error',
        {
          groups: [
            'type',
            'builtin',
            'external',
            'internal',
            'index',
            'sibling',
            'parent',
            'object',
          ],
          pathGroups: [
            {
              pattern: '@',
              group: 'internal',
            },
            {
              pattern: '@/**',
              group: 'internal',
            },
          ],
          pathGroupsExcludedImportTypes: ['type'],
          'newlines-between': 'never',
        },
      ],
      '@typescript-eslint/no-require-imports': 0,
      '@typescript-eslint/no-namespace': 0,
      '@typescript-eslint/no-explicit-any': 0,
      '@typescript-eslint/explicit-module-boundary-types': 0,
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          varsIgnorePattern: '^_',
          argsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-inferrable-types': 0,
      '@typescript-eslint/no-non-null-assertion': 0,
      '@typescript-eslint/no-this-alias': 0,
      '@typescript-eslint/no-var-requires': 0,
      '@typescript-eslint/no-empty-function': 0,
      '@typescript-eslint/no-empty-interface': 0,
      '@typescript-eslint/consistent-type-imports': ['error'],
      '@typescript-eslint/consistent-type-exports': ['error'],
      'no-throw-literal': 'off',
      '@typescript-eslint/no-throw-literal': 'off',
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'function',
          format: ['camelCase', 'PascalCase'],
          leadingUnderscore: 'allow',
          trailingUnderscore: 'allowSingleOrDouble',
        },
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
          leadingUnderscore: 'allow',
          trailingUnderscore: 'allowSingleOrDouble',
        },
        {
          selector: 'parameter',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
          trailingUnderscore: 'allowSingleOrDouble',
        },
        {
          selector: 'typeLike',
          format: ['PascalCase'],
          trailingUnderscore: 'allowSingleOrDouble',
        },
        {
          selector: 'enumMember',
          format: ['PascalCase', 'UPPER_CASE'],
        },
        {
          selector: 'objectLiteralProperty',
          format: null,
        },
        {
          selector: 'typeProperty',
          format: null,
        },
      ],
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': 'allow-with-description',
        },
      ],
    },
  },
];

export default config;
