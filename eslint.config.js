import js from '@eslint/js';
import globals from 'globals';

// TypeScript wird über `tsc --strict` (noUnusedLocals/Parameters, exactOptional …) geprüft —
// der zuverlässige Typ-Linter, solange typescript-eslint TS 7 noch nicht unterstützt.
// ESLint deckt hier die reinen JS-/MJS-Dateien (Skripte, Configs) ab.
export default [
  {
    ignores: ['**/dist/**', '**/node_modules/**', 'web/dist/**'],
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
  },
];
