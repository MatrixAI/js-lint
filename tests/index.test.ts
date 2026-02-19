import configDefault from '#config.js';
import { config } from '#index.js';

describe('index exports', () => {
  test('exports config named binding', () => {
    expect(config).toBeDefined();
    expect(Array.isArray(config)).toBe(true);
  });

  test('default config subpath export matches index named export', () => {
    expect(configDefault).toBe(config);
  });
});
