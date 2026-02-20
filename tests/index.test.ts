import eslintConfigDefault from '#configs/js.js';
import { config } from '#index.js';

describe('index exports', () => {
  test('exports config named binding', () => {
    expect(config).toBeDefined();
    expect(Array.isArray(config)).toBe(true);
  });

  test('default eslint config subpath export matches index named export', () => {
    expect(eslintConfigDefault).toBe(config);
  });
});
