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
    "no-unused-vars": "warn",
    "no-unreachable": "warn",
    "tailwindcss/no-custom-classname": "warn",
    "tailwindcss/classnames-order": "off"
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
