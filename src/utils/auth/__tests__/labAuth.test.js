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

import {
  authenticateLabAccessSSO,
  authenticateLabAccess,
  getAuthErrorMessage,
} from "../labAuth";

// Mock external dependencies
jest.mock("@/utils/dev/logger", () => ({
  log: jest.fn(),
  error: jest.fn(),
}));

// Save original fetch to restore between tests
const originalFetch = global.fetch;

// Mock global fetch initially
global.fetch = jest.fn();

describe("Lab Authentication Utilities", () => {
  const labId = "lab-123";
  const authEndpoint = "https://auth.example.com";
  const userWallet = "0xUser123";
  const mockSignMessageAsync = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
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
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    test("submits check-in and returns auth response", async () => {
      const reservationKey = "0xabc123";

      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ valid: true }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            token: "lab-access-token",
            labURL: "https://lab.example.com",
          }),
        });

      const result = await authenticateLabAccessSSO({
        labId,
        reservationKey,
        authEndpoint,
      });

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(global.fetch.mock.calls[0][0]).toBe("/api/auth/checkin");
      expect(global.fetch.mock.calls[1][0]).toBe("/api/auth/lab-access");
      expect(result).toEqual({
        token: "lab-access-token",
        labURL: "https://lab.example.com",
      });
    });

    test("throws error when check-in fails", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(
        authenticateLabAccessSSO({ labId, reservationKey: "0xabc", authEndpoint })
      ).rejects.toThrow("Institutional check-in failed. Status: 500");
    });

    test("throws error when auth request fails", async () => {
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ valid: true }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
        });

      await expect(
        authenticateLabAccessSSO({ labId, reservationKey: "0xabc", authEndpoint })
      ).rejects.toThrow("SSO authentication failed. Status: 401");
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

    test("submits check-in when reservationKey and signTypedDataAsync are provided", async () => {
      const reservationKey = "0xabc123";
      const mockSignTypedDataAsync = jest.fn().mockResolvedValue("0xCheckInSig");

      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            timestamp: 1700000000,
            typedData: {
              domain: { name: "DecentraLabsIntent", version: "1", chainId: 1, verifyingContract: "0x0" },
              types: { CheckIn: [{ name: "signer", type: "address" }] },
              primaryType: "CheckIn",
              message: { timestamp: 1700000000 },
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ valid: true, txHash: "0xTx" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ message: "Sign 1700000000000", timestampMs: 1700000000000 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: "token", labURL: "https://lab.example.com" }),
        });

      mockSignMessageAsync.mockResolvedValue("0xSig");

      await authenticateLabAccess(
        authEndpoint,
        userWallet,
        labId,
        mockSignMessageAsync,
        reservationKey,
        { signTypedDataAsync: mockSignTypedDataAsync }
      );

      expect(global.fetch).toHaveBeenCalledTimes(4);
      expect(global.fetch.mock.calls[0][0]).toContain("purpose=checkin");
      expect(global.fetch.mock.calls[1][0]).toBe("https://auth.example.com/checkin");
      expect(mockSignTypedDataAsync).toHaveBeenCalled();
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
          "Missing labId",
          "Missing booking details for SSO access. Please try again.",
        ],
        [
          "Institutional check-in failed",
          "Unable to record check-in. Please try again.",
        ],
        [
          "SSO authentication failed. Status: 401",
          "Failed to authenticate with lab service. Please try again.",
        ],
        [
          "Missing SSO session",
          "Please sign in with your institution and try again.",
        ],
        [
          "Lab does not have a configured Lab Gateway",
          "This lab does not support SSO access. Please use wallet authentication.",
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
