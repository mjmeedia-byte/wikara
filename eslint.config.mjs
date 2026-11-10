// ESLint flat config for the whole monorepo.
// This uses the modern "flat config" format introduced in ESLint 9.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Files and folders ESLint should never look at.
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      '**/.next/**',
      '**/out/**',
    ],
  },
  // Recommended rules for plain JavaScript.
  js.configs.recommended,
  // Recommended rules for TypeScript.
  ...tseslint.configs.recommended,
  // daily-limits is a standalone plain-JavaScript extension with no build
  // step. These are the browser and extension globals its files use.
  {
    files: ['daily-limits/**/*.js'],
    languageOptions: {
      globals: Object.fromEntries(
        [
          'chrome',
          'console',
          'crypto',
          'document',
          'location',
          'window',
          'getComputedStyle',
          'structuredClone',
          'setTimeout',
          'clearTimeout',
          'setInterval',
          'Blob',
          'CustomEvent',
          'HTMLMediaElement',
          'HTMLVideoElement',
          'URL',
          'URLSearchParams',
        ].map((name) => [name, 'readonly']),
      ),
    },
  },
);
