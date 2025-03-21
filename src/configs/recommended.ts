export const recommended = {
    plugins:{},
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
