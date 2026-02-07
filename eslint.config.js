const reactPlugin = require('eslint-plugin-react');
const reactHooksPlugin = require('eslint-plugin-react-hooks');
const tailwindcssPlugin = require('eslint-plugin-tailwindcss');
const jestPlugin = require('eslint-plugin-jest');

/**
 * Flat ESLint config for ESLint v10 migration.
 * This preserves existing rules from .eslintrc.cjs while using the new flat config format.
 */
module.exports = [
  // Primary config for source files
  {
    files: ['**/*.{js,mjs,cjs,jsx,ts,tsx}'],
    ignores: ['node_modules/**', '.next/**', 'coverage/**'],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      tailwindcss: tailwindcssPlugin,
      jest: jestPlugin,
    },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'no-unused-vars': 'off',
      'no-unreachable': 'warn',
      'react-hooks/exhaustive-deps': 'off',
      'tailwindcss/no-custom-classname': 'off',
      'tailwindcss/enforces-shorthand': 'off',
      'tailwindcss/classnames-order': 'off',
      '@next/next/no-img-element': 'off',
      'jsx-a11y/alt-text': 'off',
      'import/no-anonymous-default-export': 'off',
    },
    settings: {
      react: { version: 'detect' },
    },
  },

  // Tests overrides
  {
    files: ['**/*.test.{js,jsx,ts,tsx}'],
    rules: {
      'react/display-name': 'off',
      'jest/no-disabled-tests': 'warn',
      'jest/no-focused-tests': 'error',
      'jest/no-identical-title': 'error',
      'jest/valid-expect': 'error',
    },
  },
];
