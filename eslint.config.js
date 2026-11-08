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
      // No logging in shipped code: avoids leaking API keys or profile data.
      'no-console': 'error',
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
    // Untrusted text (job pages, AI output) is only ever rendered as text.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'Never render HTML from data. Render text instead.',
        },
        {
          selector: 'AssignmentExpression[left.property.name=/^(innerHTML|outerHTML)$/]',
          message: 'Never assign HTML strings. Build elements or render text.',
        },
        {
          selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
          message: 'Unsafe HTML insertion is not allowed.',
        },
        {
          selector:
            "CallExpression[callee.object.name='document'][callee.property.name=/^(write|writeln)$/]",
          message: 'document.write is not allowed.',
        },
      ],
    },
  },
  {
    // Provider/SDK code (and therefore API calls) only in the background worker.
    files: ['src/ui/**', 'src/entrypoints/**'],
    ignores: ['src/entrypoints/background.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/providers/*', '@/providers/**', '@anthropic-ai/*'],
              message: 'AI providers run in the background worker only. Use sendToBackground().',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['*.config.{js,ts}', 'scripts/**/*.mjs', 'tests/e2e/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
  prettier,
);
