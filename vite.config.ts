import { defineConfig } from 'vitest/config';

export default defineConfig({
  // GitHub Pages のサブパスでも動くよう相対パスで出力する
  base: './',
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    testTimeout: 120_000,
  },
});
