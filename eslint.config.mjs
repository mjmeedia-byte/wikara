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
      'games/pixel-surf/vendor/**',
    ],
  },
  // Recommended rules for plain JavaScript.
  js.configs.recommended,
  // Recommended rules for TypeScript.
  ...tseslint.configs.recommended,
  // Pixel Surf 64 is a plain browser game: classic scripts (no bundler, no modules).
  {
    files: ['games/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        performance: 'readonly',
        setTimeout: 'readonly',
        THREE: 'readonly',
        Ocean: 'writable',
        Surfer: 'writable',
        Sfx: 'writable',
        Scene3D: 'writable',
        module: 'writable',
        require: 'readonly',
      },
    },
    rules: {
      // Each script declares its own top-level global (Ocean, Surfer, ...), which is intended.
      'no-redeclare': 'off',
    },
  },
);
