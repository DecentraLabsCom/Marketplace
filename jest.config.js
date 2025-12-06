import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  dir: "./",
});

/** @type {import('jest').Config} */
const customJestConfig = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/src/test-utils/setupTests.js"],
  testPathIgnorePatterns: ["<rootDir>/.next/", "<rootDir>/node_modules/"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },

  // COVERAGE SETTINGS
  collectCoverageFrom: [
    "src/**/*.{js,jsx}",
    "!src/**/*.stories.{js,jsx}",
    "!src/**/*.test.{js,jsx}",
    "!src/**/*.spec.{js,jsx}",
    "!src/test-utils/**",
    "!src/contracts/**", // generated ABI bundles, not part of app logic
    "!src/**/*.config.js",
    "!src/app/**/layout.js",
    "!src/app/**/page.js",
    "!src/app/**/loading.js",
    "!src/app/**/error.js",
    "!src/app/**/not-found.js",
    "!src/app/api/**",
  ],

  coverageThreshold: {
    global: {
      branches: 53,
      functions: 57,
      lines: 65,
      statements: 64,
    },
  },

  coverageReporters: ["text", "lcov", "html", "json-summary"],

  testMatch: [
    "<rootDir>/src/**/__tests__/**/*.{js,jsx}",
    "<rootDir>/src/**/*.{test,spec}.{js,jsx}",
  ],

  transformIgnorePatterns: ["/node_modules/(?!(wagmi|viem|next)/)"],
};

export default createJestConfig(customJestConfig);
