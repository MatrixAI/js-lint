export const recommendedTypeaware = {
  plugins: {},
  languageOptions: {
    parserOptions: {
      // Consumers must override this path to match their tsconfig structure
      project: ['./tsconfig.json'],
    },
  },
  rules: {
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
  },
};
