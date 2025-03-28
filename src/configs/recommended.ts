export const recommended = {
  plugins: {},
  rules: {
    '@matrixai/no-aliased-imports': [
      'error',
      {
        aliases: [{ prefix: '#', target: 'src' }],
        includeFolders: ['src'],
        autoFix: false,
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
  },
};
