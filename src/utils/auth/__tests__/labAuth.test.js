/**
 * Unit Tests for institutional lab authentication utilities.
 */

import {
  authenticateLabAccessSSO,
  submitInstitutionalCheckIn,
  getAuthErrorMessage,
} from "../labAuth";

jest.mock("@/utils/dev/logger", () => ({
  error: jest.fn(),
}));

const originalFetch = global.fetch;

describe("Lab Authentication Utilities", () => {
  const labId = "lab-123";
  const authEndpoint = "https://auth.example.com/auth";

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  describe("submitInstitutionalCheckIn", () => {
    test("posts reservation context to the institutional check-in endpoint", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ valid: true }),
      });

      const result = await submitInstitutionalCheckIn({
        reservationKey: "rk-1",
        labId,
        authEndpoint,
      });

      expect(global.fetch).toHaveBeenCalledWith("/api/auth/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          reservationKey: "rk-1",
          labId,
          authEndpoint,
        }),
      });
      expect(result).toEqual({ valid: true });
    });

    test("throws a descriptive error when the institutional check-in fails", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(
        submitInstitutionalCheckIn({ reservationKey: "rk-1", labId, authEndpoint })
      ).rejects.toThrow("Institutional check-in failed. Status: 500");
    });
  });

  describe("authenticateLabAccessSSO", () => {
    test("submits check-in and returns lab-access response", async () => {
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
        reservationKey: "rk-1",
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

    test("skips check-in when reservation is already in use", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: "lab-access-token",
          labURL: "https://lab.example.com",
        }),
      });

      await authenticateLabAccessSSO({
        labId,
        reservationKey: "rk-1",
        authEndpoint,
        skipCheckIn: true,
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith("/api/auth/lab-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          labId,
          reservationKey: "rk-1",
          authEndpoint,
        }),
      });
    });

    test("requires labId or reservationKey", async () => {
      await expect(authenticateLabAccessSSO()).rejects.toThrow(
        "Missing labId or reservationKey for SSO access"
      );
    });

    test("throws when lab-access request fails", async () => {
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
        authenticateLabAccessSSO({ labId, reservationKey: "rk-1", authEndpoint })
      ).rejects.toThrow("SSO authentication failed. Status: 401");
    });
  });

  describe("getAuthErrorMessage", () => {
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
        "This lab does not support institutional access. Please contact the provider.",
      ],
      [
        "Unknown error",
        "There was an error with institutional authentication. Please try again.",
      ],
    ])('maps "%s" correctly', (errorMessage, expected) => {
      expect(getAuthErrorMessage(new Error(errorMessage))).toBe(expected);
    });
  });
});
