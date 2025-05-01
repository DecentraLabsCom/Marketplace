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
    "tailwindcss"
  ],
  rules: {
    "react/react-in-jsx-scope": "off",
    "react/prop-types": "off",
    "no-unused-vars": "warn",
    "no-unreachable": "warn",
    "tailwindcss/no-custom-classname": "warn",
    "tailwindcss/classnames-order": "off",
  },
  env: {
    browser: true,
    node: true,
    es2021: true
  },
  settings: {
    react: {
      version: "detect"
    }
  }
};