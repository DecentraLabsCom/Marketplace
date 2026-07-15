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
    "!src/utils/blockchain/networkConfig.js", // environment mapping constants
    "!src/utils/dev/**", // dev-only helpers and fixture data
    "!src/**/*.config.js",
  ],

  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },

  coverageProvider: "v8",

  coverageReporters: ["text", "lcov", "html", "json-summary"],

  testMatch: [
    "<rootDir>/src/**/__tests__/**/*.{js,jsx}",
    "<rootDir>/src/**/*.{test,spec}.{js,jsx}",
  ],

  transformIgnorePatterns: ["/node_modules/(?!(wagmi|viem|next)/)"],
};

export default createJestConfig(customJestConfig);
