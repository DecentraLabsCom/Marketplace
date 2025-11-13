/**
 * Unit Tests for baseUrl.js - Browser Environment
 *
 * This test file runs in Jest's default jsdom environment where window is always defined.
 * Due to this limitation, getBaseUrl() always takes the browser code path and cannot be tested here.
 * Server-side logic is tested in baseUrl.server.test.js using @jest-environment node.
 *
 * Test Behaviors:
 * - getWalletConnectMetadata(): Validates metadata structure (name, description)
 * - envUtils.isDevelopment(): Tests NODE_ENV === 'development' detection
 * - envUtils.isProduction(): Tests NODE_ENV === 'production' detection
 * - envUtils.isVercel(): Tests VERCEL_URL and VERCEL flag detection
 *
 */

import { getWalletConnectMetadata, envUtils } from "../baseUrl";

describe("baseUrl utility", () => {
  const originalProcessEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalProcessEnv };
  });

  afterEach(() => {
    process.env = originalProcessEnv;
  });

  describe("getWalletConnectMetadata", () => {
    test("includes correct name", () => {
      const result = getWalletConnectMetadata();

      expect(result.name).toBe("DecentraLabs Marketplace");
    });

    test("includes description", () => {
      const result = getWalletConnectMetadata();

      expect(result.description).toContain("DecentraLabs");
      expect(result.description).toContain("decentralized marketplace");
      expect(result.description).toContain("laboratories");
    });
  });

  describe("envUtils", () => {
    describe("isDevelopment", () => {
      test("returns true when NODE_ENV is development", () => {
        process.env.NODE_ENV = "development";

        expect(envUtils.isDevelopment()).toBe(true);
      });

      test("returns false when NODE_ENV is production", () => {
        process.env.NODE_ENV = "production";

        expect(envUtils.isDevelopment()).toBe(false);
      });

      test("returns false when NODE_ENV is undefined", () => {
        delete process.env.NODE_ENV;

        expect(envUtils.isDevelopment()).toBe(false);
      });
    });

    describe("isProduction", () => {
      test("returns true when NODE_ENV is production", () => {
        process.env.NODE_ENV = "production";

        expect(envUtils.isProduction()).toBe(true);
      });

      test("returns false when NODE_ENV is development", () => {
        process.env.NODE_ENV = "development";

        expect(envUtils.isProduction()).toBe(false);
      });

      test("returns false when NODE_ENV is test", () => {
        process.env.NODE_ENV = "test";

        expect(envUtils.isProduction()).toBe(false);
      });
    });

    describe("isVercel", () => {
      test("returns true when VERCEL_URL is set", () => {
        process.env.VERCEL_URL = "my-app.vercel.app";

        expect(envUtils.isVercel()).toBe(true);
      });

      test("returns true when VERCEL flag is set", () => {
        process.env.VERCEL = "1";

        expect(envUtils.isVercel()).toBe(true);
      });

      test("returns true when both VERCEL_URL and VERCEL are set", () => {
        process.env.VERCEL_URL = "my-app.vercel.app";
        process.env.VERCEL = "1";

        expect(envUtils.isVercel()).toBe(true);
      });

      test("returns false when neither VERCEL_URL nor VERCEL are set", () => {
        delete process.env.VERCEL_URL;
        delete process.env.VERCEL;

        expect(envUtils.isVercel()).toBe(false);
      });

      test("returns false when VERCEL vars are empty strings", () => {
        process.env.VERCEL_URL = "";
        process.env.VERCEL = "";

        expect(envUtils.isVercel()).toBe(false);
      });
    });
  });
});
