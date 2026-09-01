/**
 * Configuración de ESLint para todo el monorepo (formato plano).
 *
 * El objetivo NO es imponer estilo: para eso está el formateador. Lo que se
 * busca aquí es atrapar errores reales que el compilador no ve, sobre todo los
 * relacionados con promesas sin esperar y con el compromiso del proyecto de no
 * usar `any` ni `@ts-ignore`.
 */

import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/node_modules/**',
      'eslint.config.js',
    ],
  },

  js.configs.recommended,

  // Reglas con información de tipos: son las que de verdad encuentran cosas.
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // El proyecto se compromete a cero `any` y cero `@ts-ignore`. Estas dos
      // reglas hacen que ese compromiso lo verifique una herramienta.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',

      // Una promesa sin await ni catch es el error asíncrono más caro: falla en
      // silencio y el rechazo aparece mucho después, sin rastro del origen.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      // Permite descartar argumentos con guion bajo (patrón habitual en
      // callbacks donde solo interesa el segundo parámetro).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // Con `strict` de TypeScript activo, estas dos generan mucho ruido sobre
      // código que ya es seguro por tipos.
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },

  // --- API: Node ------------------------------------------------------------
  {
    files: ['apps/api/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // --- Frontend: navegador + hooks de React --------------------------------
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },

  // --- Pruebas: algo más permisivas ----------------------------------------
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
