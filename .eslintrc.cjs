module.exports = {
  root: true,
  extends: [
    "next/core-web-vitals",
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "plugin:tailwindcss/recommended"
  ],
  plugins: [
    "react",
    "react-hooks",
    "tailwindcss",
    "jest"
  ],
  rules: {
    "react/react-in-jsx-scope": "off",
    "react/prop-types": "off",
    "no-unused-vars": "off",
    "no-unreachable": "warn",
    "react-hooks/exhaustive-deps": "off",
    "tailwindcss/no-custom-classname": "off",
    "tailwindcss/enforces-shorthand": "off",
    "tailwindcss/classnames-order": "off",
    "@next/next/no-img-element": "off",
    "jsx-a11y/alt-text": "off",
    "import/no-anonymous-default-export": "off"
  },
  env: {
    browser: true,
    node: true,
    es2021: true,
    jest: true
  },
  settings: {
    react: {
      version: "detect"
    }
  },
  // Test files: disable displayName and apply Jest rules
  overrides: [
  {
      files: ["**/*.test.{js,jsx,ts,tsx}"],
       rules: {
      "react/display-name": "off",
      "jest/no-disabled-tests": "warn",
      "jest/no-focused-tests": "error",
      "jest/no-identical-title": "error",
      "jest/valid-expect": "error"
              }
   }
  ]
};
