/**
 * Unit Tests for Lab Authentication Utilities
 *
 * Tests authentication flows for lab access (SSO and Wallet).
 * Focuses on error handling, URL construction, and service integration.
 *
 * Tests Behaviors:
 * - SSO/JWT authentication flow
 * - Wallet signature authentication flow
 * - URL construction helper
 * - Error message mapping
 * - Edge cases and error scenarios
 */

import marketplaceJwtService from "@/utils/auth/marketplaceJwt";
import authServiceClient from "@/utils/auth/authServiceClient";
import devLog from "@/utils/dev/logger";

import {
  authenticateLabAccessSSO,
  authenticateLabAccess,
  getAuthErrorMessage,
} from "../labAuth";

// Mock external dependencies
jest.mock("@/utils/auth/marketplaceJwt");
jest.mock("@/utils/auth/authServiceClient");
jest.mock("@/utils/dev/logger", () => ({
  log: jest.fn(),
  error: jest.fn(),
}));

// Save original fetch to restore between tests
const originalFetch = global.fetch;

// Mock global fetch initially
global.fetch = jest.fn();

describe("Lab Authentication Utilities", () => {
  const mockUserData = {
    email: "test@example.com",
    affiliation: "faculty",
    name: "Test User",
  };
  const labId = "lab-123";
  const authEndpoint = "https://auth.example.com";
  const userWallet = "0xUser123";
  const mockSignMessageAsync = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock implementations in beforeEach to ensure clean state
    marketplaceJwtService.isConfigured = jest.fn();
    marketplaceJwtService.generateJwtForUser = jest.fn();
    authServiceClient.exchangeJwtForToken = jest.fn();
  });

  afterEach(() => {
    // Restore global.fetch to its original value to avoid leakage between tests
    global.fetch = originalFetch;
  });

  afterAll(() => {
    // Final restore just in case
    global.fetch = originalFetch;
  });

  describe("authenticateLabAccessSSO", () => {
    test("successfully authenticates SSO user", async () => {
      // Setup mocks
      marketplaceJwtService.isConfigured.mockResolvedValue(true);
      marketplaceJwtService.generateJwtForUser.mockReturnValue(
        "mock-jwt-token"
      );
      authServiceClient.exchangeJwtForToken.mockResolvedValue({
        token: "lab-access-token",
        labURL: "https://lab.example.com",
      });

      const result = await authenticateLabAccessSSO(mockUserData, labId);

      expect(marketplaceJwtService.isConfigured).toHaveBeenCalled();
      expect(marketplaceJwtService.generateJwtForUser).toHaveBeenCalledWith(
        mockUserData
      );
      expect(authServiceClient.exchangeJwtForToken).toHaveBeenCalledWith(
        "mock-jwt-token",
        "faculty",
        labId
      );
      expect(result).toEqual({
        token: "lab-access-token",
        labURL: "https://lab.example.com",
      });
    });

    test("throws error when JWT service not configured", async () => {
      marketplaceJwtService.isConfigured.mockResolvedValue(false);

      await expect(
        authenticateLabAccessSSO(mockUserData, labId)
      ).rejects.toThrow("JWT service is not properly configured");

      expect(marketplaceJwtService.generateJwtForUser).not.toHaveBeenCalled();
    });

    test("throws error when JWT generation fails", async () => {
      marketplaceJwtService.isConfigured.mockResolvedValue(true);
      marketplaceJwtService.generateJwtForUser.mockImplementation(() => {
        throw new Error("JWT generation failed");
      });

      await expect(
        authenticateLabAccessSSO(mockUserData, labId)
      ).rejects.toThrow("JWT generation failed");
    });

    test("throws error when token exchange fails", async () => {
      marketplaceJwtService.isConfigured.mockResolvedValue(true);
      marketplaceJwtService.generateJwtForUser.mockReturnValue("mock-jwt");
      authServiceClient.exchangeJwtForToken.mockRejectedValue(
        new Error("Exchange failed")
      );

      await expect(
        authenticateLabAccessSSO(mockUserData, labId)
      ).rejects.toThrow("Exchange failed");
    });

    test("logs error when authentication fails", async () => {
      marketplaceJwtService.isConfigured.mockResolvedValue(false);

      await expect(
        authenticateLabAccessSSO(mockUserData, labId)
      ).rejects.toThrow();

      expect(devLog.error).toHaveBeenCalledWith(
        "❌ SSO lab authentication failed:",
        expect.any(Error)
      );
    });
  });

  describe("authenticateLabAccess (Wallet Flow)", () => {
    beforeEach(() => {
      // Provide a fresh mock fetch for wallet-flow tests
      global.fetch = jest.fn();
    });

    test("successfully authenticates with wallet signature", async () => {
      const mockTimestamp = 1700000000000;
      // Mock message endpoint
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 
          message: "Sign this message", 
          timestampMs: mockTimestamp 
        }),
      });

      // Mock signature
      mockSignMessageAsync.mockResolvedValue("0xSignature123");

      // Mock auth2 endpoint
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: "lab-token",
          labURL: "https://lab.example.com",
        }),
      });

      const result = await authenticateLabAccess(
        authEndpoint,
        userWallet,
        labId,
        mockSignMessageAsync
      );

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(mockSignMessageAsync).toHaveBeenCalledWith({
        message: "Sign this message",
      });
      expect(result).toEqual({
        token: "lab-token",
        labURL: "https://lab.example.com",
      });
    });

    test("includes reservationKey when provided", async () => {
      const reservationKey = "reservation-789";

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: "Sign this 1700000000000", timestampMs: 1700000000000 }),
      });

      mockSignMessageAsync.mockResolvedValue("0xSig");

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: "token" }),
      });

      await authenticateLabAccess(
        authEndpoint,
        userWallet,
        labId,
        mockSignMessageAsync,
        reservationKey
      );

      // Check second fetch call (auth2)
      const auth2Call = global.fetch.mock.calls[1];
      const auth2Body = JSON.parse(auth2Call[1].body);

      expect(auth2Body.reservationKey).toBe(reservationKey);
    });

    test("handles trailing slash in auth endpoint", async () => {
      const endpointWithSlash = "https://auth.example.com/";

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: "Sign 1700000000000", timestampMs: 1700000000000 }),
      });
      mockSignMessageAsync.mockResolvedValue("0xSig");
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: "token" }),
      });

      await authenticateLabAccess(
        endpointWithSlash,
        userWallet,
        labId,
        mockSignMessageAsync
      );

      // Verify URLs don't have double slashes
      expect(global.fetch.mock.calls[0][0]).toBe(
        "https://auth.example.com/message"
      );
      expect(global.fetch.mock.calls[1][0]).toBe(
        "https://auth.example.com/wallet-auth2"
      );
    });

    test("throws error when message request fails", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(
        authenticateLabAccess(
          authEndpoint,
          userWallet,
          labId,
          mockSignMessageAsync
        )
      ).rejects.toThrow("Failed to get authentication message. Status: 500");
    });

    test("throws error when auth2 request fails", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: "Sign 1700000000000", timestampMs: 1700000000000 }),
      });
      mockSignMessageAsync.mockResolvedValue("0xSig");
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      await expect(
        authenticateLabAccess(
          authEndpoint,
          userWallet,
          labId,
          mockSignMessageAsync
        )
      ).rejects.toThrow("Authentication service error. Status: 401");
    });

    test("throws error when signature is rejected", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: "Sign 1700000000000", timestampMs: 1700000000000 }),
      });
      mockSignMessageAsync.mockRejectedValue(new Error("User rejected"));

      await expect(
        authenticateLabAccess(
          authEndpoint,
          userWallet,
          labId,
          mockSignMessageAsync
        )
      ).rejects.toThrow("User rejected");
    });

    test("throws error for invalid auth endpoint", async () => {
      await expect(
        authenticateLabAccess(null, userWallet, labId, mockSignMessageAsync)
      ).rejects.toThrow(/Invalid auth endpoint/);

      await expect(
        authenticateLabAccess(123, userWallet, labId, mockSignMessageAsync)
      ).rejects.toThrow(/Invalid auth endpoint/);
    });
  });

  describe("getAuthErrorMessage", () => {
    describe("JWT Flow Errors", () => {
      test.each([
        [
          "JWT service is not properly configured",
          "Authentication system is not configured. Please contact support.",
        ],
        [
          "Lab does not have a configured Lab Gateway",
          "This lab does not support SSO access. Please use wallet authentication.",
        ],
        [
          "Failed to exchange JWT",
          "Failed to authenticate with lab service. Please try again.",
        ],
        [
          "Unknown JWT error",
          "There was an error with SSO authentication. Please try again or use wallet authentication.",
        ],
      ])('maps JWT error "%s" correctly', (errorMessage, expected) => {
        const error = new Error(errorMessage);

        const result = getAuthErrorMessage(error, true);

        expect(result).toBe(expected);
      });
    });

    describe("Wallet Flow Errors", () => {
      test.each([
        [
          "User rejected the signature",
          "Signature was cancelled. Please try again.",
        ],
        [
          "Failed to get authentication message",
          "Failed to get the message to sign. Please try again.",
        ],
        [
          "Authentication service error. Status: 500",
          "An error has occurred in the authentication service.",
        ],
        [
          "Unknown wallet error",
          "There was an error verifying your booking. Try again.",
        ],
      ])('maps wallet error "%s" correctly', (errorMessage, expected) => {
        const error = new Error(errorMessage);

        const result = getAuthErrorMessage(error, false);

        expect(result).toBe(expected);
      });
    });

    test("defaults to wallet flow when isJwtFlow not provided", () => {
      const error = new Error("User rejected");

      const result = getAuthErrorMessage(error);

      expect(result).toBe("Signature was cancelled. Please try again.");
    });
  });
});
