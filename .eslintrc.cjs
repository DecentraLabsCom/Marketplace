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
    // Ejemplo de reglas personalizadas:
    "react/react-in-jsx-scope": "off", // Next.js no requiere React importado en cada archivo
    "react/prop-types": "off",         // Si no usas PropTypes
    "no-unused-vars": "warn",
    "tailwindcss/no-custom-classname": "off" // Permite clases personalizadas de Tailwind
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