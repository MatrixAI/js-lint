export const recommended = {
  rules: {
    '@matrixai/no-aliased-imports': [
      'error',
      {
        aliases: [{ prefix: '#', target: 'src' }],
        includeFolders: ['src'],
        autoFix: false,
      },
    ],
  },
};
