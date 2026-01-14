const js = require("@eslint/js");
const globals = require("globals");
const react = require("eslint-plugin-react");
const reactHooks = require("eslint-plugin-react-hooks");
const tailwindcss = require("eslint-plugin-tailwindcss");
const jest = require("eslint-plugin-jest");
const nextCoreWebVitals = require("eslint-config-next/core-web-vitals");

const nextConfigs = Array.isArray(nextCoreWebVitals)
  ? nextCoreWebVitals
  : [nextCoreWebVitals];
const tailwindConfigs = Array.isArray(tailwindcss.configs["flat/recommended"])
  ? tailwindcss.configs["flat/recommended"]
  : [tailwindcss.configs["flat/recommended"]];
module.exports = [
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/coverage/**",
      "**/out/**",
      "**/build/**",
      "tailwind.config.js",
      "postcss.config.js",
      "next.config.js",
      "jest.config.js",
      "cypress.config.js",
    ],
  },
  {
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  ...nextConfigs,
  js.configs.recommended,
  react.configs.flat.recommended,
  reactHooks.configs.flat.recommended,
  ...tailwindConfigs,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "no-unused-vars": "off",
      "no-unreachable": "warn",
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/use-memo": "off",
      "tailwindcss/no-custom-classname": "off",
      "tailwindcss/enforces-shorthand": "off",
      "tailwindcss/classnames-order": "off",
      "@next/next/no-img-element": "off",
      "jsx-a11y/alt-text": "off",
      "import/no-anonymous-default-export": "off",
    },
  },
  {
    files: [
      "**/*.test.{js,jsx,ts,tsx}",
      "**/*.spec.{js,jsx,ts,tsx}",
      "**/__tests__/**/*.{js,jsx,ts,tsx}",
      "src/test-utils/**/*.{js,jsx,ts,tsx}",
      "**/setupTests.{js,jsx,ts,tsx}",
    ],
    plugins: {
      jest,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      "react/display-name": "off",
      "jest/no-disabled-tests": "warn",
      "jest/no-focused-tests": "error",
      "jest/no-identical-title": "error",
      "jest/valid-expect": "error",
    },
  },
  {
    files: ["cypress/**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.mocha,
        ...globals.chai,
        Cypress: "readonly",
        cy: "readonly",
      },
    },
  },
];
