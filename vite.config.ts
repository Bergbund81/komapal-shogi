import { defineConfig } from 'vitest/config';

/** やねうら王 wasm（スレッド版）は SharedArrayBuffer を使うので、クロスオリジン分離にする */
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  // GitHub Pages のサブパスでも動くよう相対パスで出力する
  base: './',
  // AI の Worker を ES モジュールとして出力する（new Worker(..., { type: 'module' }) と合わせる）
  worker: { format: 'es' },
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    testTimeout: 120_000,
  },
});
