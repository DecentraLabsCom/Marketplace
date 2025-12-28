/**
 * Unit Tests for Auth Service Client utilities
 *
 * Verifies authentication service integration with Lab Gateway endpoints
 *
 * Test Behaviors:
 * - URL extraction and validation from lab contract data structures
 * - Authentication request processing with JSON and plain text response handling
 * - Comprehensive error handling for HTTP errors and network failures
 * - Service health monitoring and connectivity validation
 * - Parameter validation and delegation between public and private methods
 */

import authServiceClient from "../authServiceClient";
import devLog from "@/utils/dev/logger";

// Mock logger dependency to verify proper logging behavior without console output
jest.mock("@/utils/dev/logger", () => ({
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
}));

const originalFetch = global.fetch;

describe("AuthServiceClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("URL Extraction and Validation", () => {
    test("returns null and logs warning when lab contract data lacks auth service URL", () => {
      const data = { base: { uri: "x" } };
      const res = authServiceClient.getAuthServiceUrlFromLab(data);
      expect(res).toBeNull();
      expect(devLog.warn).toHaveBeenCalledWith(
        "Lab contract data has no authURI (auth-service URL)"
      );
    });

    test("rejects invalid URL schemes with proper warning logging", () => {
      const data = { authURI: "ftp://example.com" };
      const res = authServiceClient.getAuthServiceUrlFromLab(data);
      expect(res).toBeNull();
      expect(devLog.warn).toHaveBeenCalledWith(
        "Invalid Lab Gateway's auth-service URL format:",
        "ftp://example.com"
      );
    });

    test("normalizes URL format by removing trailing slashes and appending auth endpoint", () => {
      const data1 = { authURI: "https://gateway.example.com/" };
      const res1 = authServiceClient.getAuthServiceUrlFromLab(data1);
      expect(res1).toBe("https://gateway.example.com/auth");

      const data2 = { authURI: "https://gateway.example.com" };
      const res2 = authServiceClient.getAuthServiceUrlFromLab(data2);
      expect(res2).toBe("https://gateway.example.com/auth");
    });

    test("preserves existing auth endpoint while removing trailing slashes", () => {
      const data = { authURI: "https://gateway.example.com/auth/" };
      const res = authServiceClient.getAuthServiceUrlFromLab(data);
      expect(res).toBe("https://gateway.example.com/auth");
    });

    test("gracefully handles malformed contract data with error recovery", () => {
      // Simulate data structure corruption to test error boundary
      const bad = Object.defineProperty({}, "base", {
        get: () => {
          throw new Error("boom");
        },
      });

      const res = authServiceClient.getAuthServiceUrlFromLab(bad);
      expect(res).toBeNull();
      expect(devLog.error).toHaveBeenCalledWith(
        "Error extracting auth-service URL from lab contract data:",
        expect.any(String)
      );
    });
  });

  describe("Authentication Request Processing", () => {
    const fakeUrl = "https://gateway.example.com/auth";

    test("successfully processes structured JSON responses from auth service", async () => {
      const jsonPayload = { token: "abc", labURL: "https://lab" };
      global.fetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(jsonPayload),
      });

      const result = await authServiceClient.makeAuthRequest(
        fakeUrl,
        "/marketplace-auth",
        "jwt",
        null,
        false
      );

      expect(global.fetch).toHaveBeenCalledWith(
        `${fakeUrl}/marketplace-auth`,
        expect.any(Object)
      );
      expect(result).toEqual(jsonPayload);
      expect(devLog.success).toHaveBeenCalled();
    });

    test("handles plain text token responses with proper object wrapping", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "PLAINTOKEN",
      });

      const result = await authServiceClient.makeAuthRequest(
        fakeUrl,
        "/marketplace-auth",
        "jwt",
        null,
        false
      );

      expect(result).toEqual({ token: "PLAINTOKEN" });
    });

    test("throws descriptive errors for HTTP error responses with status codes", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        text: async () => "Bad Gateway",
      });

      await expect(
        authServiceClient.makeAuthRequest(
          fakeUrl,
          "/marketplace-auth",
          "jwt",
          null,
          false
        )
      ).rejects.toThrow(/Auth service request failed: 502/);

      expect(devLog.error).toHaveBeenCalledWith(
        expect.stringContaining("❌ Auth service request failed ("),
        "Bad Gateway"
      );
    });

    test("wraps network errors with contextual information for debugging", async () => {
      global.fetch.mockRejectedValueOnce(new Error("network down"));

      await expect(
        authServiceClient.makeAuthRequest(
          fakeUrl,
          "/marketplace-auth",
          "jwt",
          null,
          false
        )
      ).rejects.toThrow(
        /Failed to communicate with auth-service: network down/
      );

      expect(devLog.error).toHaveBeenCalledWith(
        "❌ Auth service client error:",
        expect.any(String)
      );
    });

    test("includes lab identifier in authorization request payloads", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ ok: true }),
      });

      await authServiceClient.makeAuthRequest(
        fakeUrl,
        "/marketplace-auth2",
        "jwt",
        "lab-1",
        true
      );

      const call = global.fetch.mock.calls[0][1];
      const body = JSON.parse(call.body);
      expect(body).toHaveProperty("labId", "lab-1");
      expect(body).toHaveProperty("marketplaceToken", "jwt");
      expect(body).toHaveProperty("timestamp");
    });
  });

  describe("Public API Method Validation", () => {
    const labContractData = { authURI: "https://gateway.example.com" };

    test("validates contract configuration before authentication token requests", async () => {
      const bad = { base: {} };
      await expect(
        authServiceClient.requestAuthToken("jwt", bad)
      ).rejects.toThrow(
        /Lab does not have a configured auth-service URL in contract data/
      );
    });

    test("delegates authentication requests to internal method with correct parameters", async () => {
      const spy = jest
        .spyOn(authServiceClient, "makeAuthRequest")
        .mockResolvedValueOnce({ token: "t" });

      const res = await authServiceClient.requestAuthToken(
        "jwt",
        labContractData
      );
      expect(spy).toHaveBeenCalledWith(
        "https://gateway.example.com/auth",
        "/marketplace-auth",
        "jwt",
        null,
        false
      );
      expect(res).toEqual({ token: "t" });

      spy.mockRestore();
    });

    test("enforces lab identifier requirement for authorization requests", async () => {
      await expect(
        authServiceClient.requestAuthWithAuthorization(
          "jwt",
          labContractData,
          null
        )
      ).rejects.toThrow(/Lab ID is required for authorization requests/);
    });

    test("delegates authorization requests with lab context to internal method", async () => {
      const spy = jest
        .spyOn(authServiceClient, "makeAuthRequest")
        .mockResolvedValueOnce({ token: "t" });

      const res = await authServiceClient.requestAuthWithAuthorization(
        "jwt",
        labContractData,
        "lab-xyz"
      );
      expect(spy).toHaveBeenCalledWith(
        "https://gateway.example.com/auth",
        "/marketplace-auth2",
        "jwt",
        "lab-xyz",
        true
      );
      expect(res).toEqual({ token: "t" });

      spy.mockRestore();
    });
  });

  describe("Service Health Monitoring", () => {
    test("returns false when health check cannot be performed due to missing URL", async () => {
      const bad = { base: {} };
      const res = await authServiceClient.healthCheck(bad);
      expect(res).toBe(false);
      expect(devLog.warn).toHaveBeenCalledWith(
        "⚠️ Cannot perform health check: no Lab Gateway auth-service URL in contract data"
      );
    });

    test("returns true when health endpoint responds with successful status", async () => {
      const good = { authURI: "https://gateway.example.com" };
      global.fetch.mockResolvedValueOnce({ ok: true });
      const res = await authServiceClient.healthCheck(good);
      expect(res).toBe(true);

      // Verify health check logging with flexible assertion for multiple arguments
      expect(devLog.log).toHaveBeenCalled();
      const joined = devLog.log.mock.calls.flat().join(" ");
      expect(joined).toEqual(
        expect.stringContaining("Lab Gateway auth-service health check for")
      );
      expect(joined).toEqual(expect.stringContaining("✅ OK"));
    });

    test("returns false when health endpoint responds with error status", async () => {
      const good = { authURI: "https://gateway.example.com" };
      global.fetch.mockResolvedValueOnce({ ok: false });
      const res = await authServiceClient.healthCheck(good);
      expect(res).toBe(false);

      expect(devLog.log).toHaveBeenCalled();
      const joined = devLog.log.mock.calls.flat().join(" ");
      expect(joined).toEqual(
        expect.stringContaining("Lab Gateway auth-service health check for")
      );
      expect(joined).toEqual(expect.stringContaining("❌ FAILED"));
    });

    test("handles network failures during health checks with graceful degradation", async () => {
      const good = { authURI: "https://gateway.example.com" };
      global.fetch.mockRejectedValueOnce(new Error("timeout"));
      const res = await authServiceClient.healthCheck(good);
      expect(res).toBe(false);
      expect(devLog.warn).toHaveBeenCalledWith(
        "⚠️ Lab Gateway auth-service health check failed:",
        expect.any(String)
      );
    });
  });
});
