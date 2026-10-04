/**
 * @jest-environment node
 *
 * Unit Tests for baseUrl.js - SERVER ENVIRONMENT
 *
 * This test file uses @jest-environment node to disable jsdom, allowing us to test
 * the server-side logic that runs when typeof window === 'undefined'.
 *
 * Coverage Target: Lines 19-46 (server logic in getBaseUrl)
 *
 * This complements baseUrl.test.js which tests browser environment and envUtils.
 */

import { getBaseUrl } from "../baseUrl";

describe("baseUrl utility - Server Environment", () => {
  const originalProcessEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalProcessEnv };
    // Ensure no browser environment
    delete global.window;
  });

  afterEach(() => {
    process.env = originalProcessEnv;
  });

  describe("getBaseUrl - Server-side logic", () => {
    describe("Priority 1: Explicit NEXT_PUBLIC_BASE_URL", () => {
      test("uses explicit URL in production", () => {
        process.env.NODE_ENV = "production";
        process.env.NEXT_PUBLIC_BASE_URL = "https://custom-domain.com";

        const result = getBaseUrl();

        expect(result).toBe("https://custom-domain.com");
      });

      test("uses explicit localhost URL in development", () => {
        process.env.NODE_ENV = "development";
        process.env.NEXT_PUBLIC_BASE_URL = "http://localhost:4000";

        const result = getBaseUrl();

        expect(result).toBe("http://localhost:4000");
      });

      test("ignores non-localhost explicit URL in development", () => {
        process.env.NODE_ENV = "development";
        process.env.NEXT_PUBLIC_BASE_URL = "https://production.com";
        process.env.HOSTNAME = "localhost";

        const result = getBaseUrl();

        expect(result).toBe("http://localhost:3000");
      });

      test("uses explicit URL in test environment", () => {
        process.env.NODE_ENV = "test";
        process.env.NEXT_PUBLIC_BASE_URL = "https://test-env.com";

        const result = getBaseUrl();

        expect(result).toBe("https://test-env.com");
      });
    });

    describe("Priority 2: Development + Localhost", () => {
      test("returns localhost:3000 in development with HOSTNAME=localhost", () => {
        process.env.NODE_ENV = "development";
        process.env.HOSTNAME = "localhost";

        const result = getBaseUrl();

        expect(result).toBe("http://localhost:3000");
      });

      test("returns localhost:3000 in development with HOST=localhost", () => {
        process.env.NODE_ENV = "development";
        process.env.HOST = "localhost";

        const result = getBaseUrl();

        expect(result).toBe("http://localhost:3000");
      });

      test("returns localhost:3000 in development without VERCEL_URL", () => {
        process.env.NODE_ENV = "development";
        delete process.env.VERCEL_URL;

        const result = getBaseUrl();

        expect(result).toBe("http://localhost:3000");
      });

      test("fails closed if no production URL is configured", () => {
        process.env.NODE_ENV = "production";
        process.env.HOSTNAME = "localhost";

        expect(() => getBaseUrl()).toThrow(
          "Marketplace base URL is not configured. Set NEXT_PUBLIC_BASE_URL or VERCEL_URL.",
        );
      });
    });

    describe("Priority 3: Vercel deployment", () => {
      test("uses VERCEL_URL when available", () => {
        process.env.VERCEL_URL = "my-app-staging.vercel.app";
        process.env.NODE_ENV = "production";

        const result = getBaseUrl();

        expect(result).toBe("https://my-app-staging.vercel.app");
      });

      test("fails closed when Vercel has no deployment URL", () => {
        process.env.VERCEL = "true";
        process.env.NODE_ENV = "production";
        delete process.env.VERCEL_URL;

        expect(() => getBaseUrl()).toThrow(
          "Marketplace base URL is not configured. Set NEXT_PUBLIC_BASE_URL or VERCEL_URL.",
        );
      });

      test("VERCEL_URL takes precedence over VERCEL flag", () => {
        process.env.VERCEL = "true";
        process.env.VERCEL_URL = "custom-preview.vercel.app";
        process.env.NODE_ENV = "production";

        const result = getBaseUrl();

        expect(result).toBe("https://custom-preview.vercel.app");
      });

      test("fails closed when VERCEL_URL is empty", () => {
        process.env.VERCEL_URL = "";
        process.env.VERCEL = "true";
        process.env.NODE_ENV = "production";

        expect(() => getBaseUrl()).toThrow(
          "Marketplace base URL is not configured. Set NEXT_PUBLIC_BASE_URL or VERCEL_URL.",
        );
      });
    });

    describe("Missing deployment configuration", () => {
      test("fails closed when no other conditions match", () => {
        process.env.NODE_ENV = "production";
        delete process.env.VERCEL_URL;
        delete process.env.VERCEL;
        delete process.env.NEXT_PUBLIC_BASE_URL;

        expect(() => getBaseUrl()).toThrow(
          "Marketplace base URL is not configured. Set NEXT_PUBLIC_BASE_URL or VERCEL_URL.",
        );
      });

      test("fails closed when NODE_ENV is undefined", () => {
        delete process.env.NODE_ENV;

        expect(() => getBaseUrl()).toThrow(
          "Marketplace base URL is not configured. Set NEXT_PUBLIC_BASE_URL or VERCEL_URL.",
        );
      });

      test("fails closed in test environment without config", () => {
        process.env.NODE_ENV = "test";
        delete process.env.NEXT_PUBLIC_BASE_URL;

        expect(() => getBaseUrl()).toThrow(
          "Marketplace base URL is not configured. Set NEXT_PUBLIC_BASE_URL or VERCEL_URL.",
        );
      });
    });
  });
});
