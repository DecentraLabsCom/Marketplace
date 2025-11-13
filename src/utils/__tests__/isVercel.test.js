/**
 * Unit Tests for Vercel Environment Detector (getIsVercel)
 *
 * Tests the utility function that checks if the application is running on Vercel
 * by verifying the presence of the VERCEL environment variable.
 *
 * Test Behaviors:
 * - Basic truthy/falsy coercion
 * - Environment variable presence
 * - Various falsy value types
 * - Truthy value variations
 * - Edge cases
 */

import getIsVercel from "../isVercel";

describe("getIsVercel - Vercel Environment Detector", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv }; // Copy original env for each test
  });

  afterAll(() => {
    process.env = originalEnv; // Restore original env after all tests
  });

  describe("Basic Truthy/Falsy Coercion", () => {
    test("returns true for truthy VERCEL value (e.g., '1')", () => {
      process.env.VERCEL = "1";
      expect(getIsVercel()).toBe(true);
    });

    test("returns false when VERCEL is undefined", () => {
      delete process.env.VERCEL;
      expect(getIsVercel()).toBe(false);
    });

    test("returns false for empty string", () => {
      process.env.VERCEL = "";
      expect(getIsVercel()).toBe(false);
    });
  });

  describe("Environment Variable Presence", () => {
    test("returns true when VERCEL is set to a non-empty string", () => {
      process.env.VERCEL = "production";
      expect(getIsVercel()).toBe(true);
    });

    test("returns false when VERCEL is not present in env", () => {
      delete process.env.VERCEL;
      expect(getIsVercel()).toBe(false);
    });
  });

  describe("Various Falsy Value Types", () => {
    test.each([
      [null, "null"],
      [undefined, "undefined"],
      [false, "false"],
      [0, "zero"],
      ["", "empty string"],
    ])("returns false for falsy value: %s", (value) => {
      process.env.VERCEL = value;
      expect(getIsVercel()).toBe(false);
    });
  });

  describe("Truthy Value Variations", () => {
    test("returns true for string 'true'", () => {
      process.env.VERCEL = "true";
      expect(getIsVercel()).toBe(true);
    });

    test("returns true for non-zero number (e.g., 1)", () => {
      process.env.VERCEL = 1;
      expect(getIsVercel()).toBe(true);
    });

    test("returns true for object (e.g., {})", () => {
      process.env.VERCEL = {};
      expect(getIsVercel()).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    test("handles VERCEL set to NaN (falsy)", () => {
      process.env.VERCEL = NaN;
      expect(getIsVercel()).toBe(false);
    });

    test("handles VERCEL set to function (truthy)", () => {
      process.env.VERCEL = () => {};
      expect(getIsVercel()).toBe(true);
    });

    test("does not crash if process.env is manipulated", () => {
      process.env = {}; // Simulate empty env
      expect(getIsVercel()).toBe(false);
    });
  });

  describe("Real-World Use Cases", () => {
    test("detects Vercel in production-like env", () => {
      process.env.VERCEL = "1";
      process.env.NODE_ENV = "production";
      expect(getIsVercel()).toBe(true);
    });

    test("detects non-Vercel in local dev env", () => {
      delete process.env.VERCEL;
      process.env.NODE_ENV = "development";
      expect(getIsVercel()).toBe(false);
    });

    test("handles CI/CD env where VERCEL might be set conditionally", () => {
      process.env.CI = "true";
      process.env.VERCEL = "ci-branch";
      expect(getIsVercel()).toBe(true);
    });
  });
});
