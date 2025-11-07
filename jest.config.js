// import nextJest from 'next/jest.js';

// const createJestConfig = nextJest({
//   dir: './',
// });

// /** @type {import('jest').Config} */
// const customJestConfig = {
//   testEnvironment: 'jsdom',
//   setupFilesAfterEnv: ['<rootDir>/src/test-utils/setupTests.js'],
//   testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/'],
//   moduleNameMapper: {
//     '^@/(.*)$': '<rootDir>/src/$1',
//   },
//   collectCoverageFrom: [
//     'src/**/*.{js,jsx}',
//     '!src/**/*.stories.{js,jsx}',
//     '!src/test-utils/**',
//   ],
//   testMatch: [
//     '<rootDir>/src/**/__tests__/**/*.{js,jsx}',
//     '<rootDir>/src/**/*.{test,spec}.{js,jsx}',
//   ],

//   transformIgnorePatterns: [
//      // Allow transformation of ESM packages that Jest can't handle directly
//   '/node_modules/(?!(wagmi|viem|next)/)',
//   ],
// };

// export default createJestConfig(customJestConfig);

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
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
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
