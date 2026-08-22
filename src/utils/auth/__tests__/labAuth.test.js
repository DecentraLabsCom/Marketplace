/**
 * Unit Tests for institutional lab authentication utilities.
 */

import {
  authenticateLabAccessSSO,
  getAuthErrorMessage,
} from "../labAuth";
import * as labAuth from "../labAuth";

jest.mock("@/utils/dev/logger", () => ({
  error: jest.fn(),
}));

const originalFetch = global.fetch;

describe("Lab Authentication Utilities", () => {
  const labId = "lab-123";
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  test("does not expose the removed institutional check-in helper", () => {
    expect(labAuth.submitInstitutionalCheckIn).toBeUndefined();
  });

  describe("authenticateLabAccessSSO", () => {
    test("returns the lab-access response", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: "lab-access-token",
          labURL: "https://lab.example.com",
        }),
      });

      const result = await authenticateLabAccessSSO({
        labId,
        reservationKey: "rk-1",
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith("/api/auth/lab-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          labId,
          reservationKey: "rk-1",
        }),
      });
      expect(result).toEqual({
        token: "lab-access-token",
        labURL: "https://lab.example.com",
      });
    });

    test("requires labId or reservationKey", async () => {
      await expect(authenticateLabAccessSSO()).rejects.toThrow(
        "Missing labId or reservationKey for SSO access"
      );
    });

    test("throws when lab-access request fails", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({
          error: 'Institutional identity mismatch',
          code: 'IDENTITY_MISMATCH',
          correlationId: 'corr-1',
        }),
      });

      await expect(
        authenticateLabAccessSSO({ labId, reservationKey: "rk-1" })
      ).rejects.toMatchObject({
        message: 'Institutional identity mismatch',
        code: 'IDENTITY_MISMATCH',
        correlationId: 'corr-1',
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch.mock.calls[0][0]).toBe("/api/auth/lab-access");
    });

    test("continues a retryable pending authorization without repeating the check-in", async () => {
      global.fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          headers: new Headers({ "Retry-After": "0" }),
          text: async () => JSON.stringify({
            error: "Access authorization is still pending.",
            code: "ACCESS_AUTHORIZATION_PENDING",
            retryable: true,
            reservationKey: "rk-canonical",
            txHash: `0x${"a".repeat(64)}`,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ accessCode: "opaque-code", labURL: "https://lab.example.com" }),
        });

      const result = await authenticateLabAccessSSO({ labId, reservationKey: "rk-1" });

      expect(result).toEqual({ accessCode: "opaque-code", labURL: "https://lab.example.com" });
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
        labId,
        reservationKey: "rk-1",
      });
      expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({
        labId,
        reservationKey: "rk-canonical",
        retryPendingAuthorization: true,
        accessAuthorizationTxHash: `0x${"a".repeat(64)}`,
      });
    });
  });

  describe("getAuthErrorMessage", () => {
    test.each([
      [
        'CHECKIN_SIGNER_NOT_AUTHORIZED',
        'The institution is not authorized to check in this reservation. Please contact your institution administrator.',
      ],
      [
        'CHECKIN_MANUAL_INTERVENTION',
        'This reservation requires institutional intervention before access can be granted.',
      ],
      [
        'ACCESS_AUTHORIZATION_PENDING',
        'Access authorization is still pending. Please try again in a moment.',
      ],
      [
        'ACCESS_AUTHORIZATION_REJECTED',
        'The reservation was not authorized for laboratory access.',
      ],
    ])('maps structured code %s correctly', (code, expected) => {
      const error = new Error('safe backend message')
      error.code = code
      expect(getAuthErrorMessage(error)).toBe(expected)
    })

    test.each([
      [
        "Missing labId",
        "Missing booking details for SSO access. Please try again.",
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
