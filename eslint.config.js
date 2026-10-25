import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'tools/.venv/', 'public/'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  prettier,
  // Node で動かす開発用スクリプト
  { files: ['tools/**/*.mjs'], languageOptions: { globals: { console: 'readonly' } } },
);
