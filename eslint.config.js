import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['.output/', '.wxt/', 'node_modules/', 'coverage/', 'graphify-out/'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
  {
    // Storage isolation: only src/storage/ may touch extension storage APIs.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/storage/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'browser', property: 'storage', message: 'Use repositories from @/storage.' },
        { object: 'chrome', property: 'storage', message: 'Use repositories from @/storage.' },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'localStorage', message: 'Use repositories from @/storage.' },
        { name: 'sessionStorage', message: 'Use repositories from @/storage.' },
        { name: 'indexedDB', message: 'Use repositories from @/storage.' },
      ],
    },
  },
  {
    files: ['*.config.{js,ts}'],
    languageOptions: { globals: { ...globals.node } },
  },
  prettier,
);
