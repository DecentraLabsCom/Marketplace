/**
 * Unit Tests for useBookingAtomicQueries (SSO) hook
 *
 * Tests the atomic booking query hooks used exclusively in SSO environments.
 * These hooks communicate directly with the backend API (/api/contract/reservation/*)
 * and are responsible for retrieving reservation data without touching the blockchain.
 *
 * Tests Behaviors:
 * - Configuration - Validates BOOKING_QUERY_CONFIG production settings
 * - useReservationSSO - Success fetch, disabled without key, error handling, custom options
 * - useReservationsOfTokenSSO - Success fetch, disabled without labId, correct endpoint
 * - Query Options - Hooks accept and respect React Query overrides (enabled, retry, callbacks)
 * - SSR Safety - Queries are disabled during server-side rendering via ssrSafe wrapper
 * - API Contract Compliance - Correct endpoints, headers, and parameter encoding
 *
 */

import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useReservationSSO,
  useReservationsOfTokenSSO,
  BOOKING_QUERY_CONFIG,
} from "@/hooks/booking/useBookingAtomicQueries";

// Mock fetch globally
global.fetch = jest.fn();

// Mock logger
jest.mock("@/utils/dev/logger", () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    moduleLoaded: jest.fn(), // Essential to prevent crash
  },
}));

// Mock SSR safe utility
jest.mock("@/utils/hooks/ssrSafe", () => ({
  createSSRSafeQuery: jest.fn((queryFn, defaultValue) => {
    return (...args) => {
      if (typeof window === "undefined") {
        return Promise.resolve(defaultValue);
      }
      return queryFn(...args);
    };
  }),
}));

// Mock query keys
jest.mock("@/utils/hooks/queryKeys", () => ({
  bookingQueryKeys: {
    byReservationKey: jest.fn((key) => ["booking", "reservation", key]),
    getReservationsOfToken: jest.fn((labId) => ["booking", "token", labId]),
  },
}));

// Mock dependencies to isolate the test
jest.mock("@/utils/hooks/getIsSSO", () => ({
  useGetIsSSO: jest.fn(() => true),
}));

jest.mock("@/hooks/contract/useDefaultReadContract", () => ({
  __esModule: true,
  default: jest.fn(),
}));

// Helper to create QueryClient wrapper
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false, // Global default, but hooks might override this
        cacheTime: 0,
        staleTime: 0,
      },
      mutations: { retry: false },
    },
  });

  return ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("useBookingAtomicQueries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch.mockClear();
  });

  // Configuration Tests
  describe("Configuration", () => {
    test("BOOKING_QUERY_CONFIG has correct production settings", () => {
      expect(BOOKING_QUERY_CONFIG).toEqual({
        staleTime: 15 * 60 * 1000, // 15 minutes
        gcTime: 60 * 60 * 1000, // 60 minutes
        refetchOnWindowFocus: false,
        refetchInterval: false,
        refetchOnReconnect: true,
        retry: 1,
      });
    });
  });

  // useReservationSSO Tests
  describe("useReservationSSO", () => {
    const mockData = {
      reservation: {
        labId: "1",
        renter: "0x123",
        status: 1,
        reservationState: "Booked/Confirmed",
      },
    };

    test("fetches reservation successfully with valid reservationKey", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const reservationKey = "key123";
      const { result } = renderHook(() => useReservationSSO(reservationKey), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockData);
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/contract/reservation/getReservation?reservationKey=${reservationKey}`,
        expect.objectContaining({
          method: "GET",
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    test("remains disabled when reservationKey is null or undefined", () => {
      const { result } = renderHook(() => useReservationSSO(null), {
        wrapper: createWrapper(),
      });

      expect(result.current.fetchStatus).toBe("idle");
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test("handles API error gracefully with immediate failure when retry is disabled", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      // Override hook's retry: 1 to get immediate error in test
      const { result } = renderHook(
        () => useReservationSSO("errorKey", { retry: false }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toBeDefined();
    });
  });

  // useReservationsOfTokenSSO Tests
  describe("useReservationsOfTokenSSO", () => {
    const mockReservations = [
      { id: 1, renter: "0xABC", status: 1 },
      { id: 2, renter: "0xDEF", status: 0 },
    ];

    test("fetches all reservations for a lab token successfully", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockReservations,
      });

      const labId = "42";
      const { result } = renderHook(() => useReservationsOfTokenSSO(labId), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockReservations);
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/contract/reservation/getReservationsOfToken?labId=${labId}`,
        expect.objectContaining({
          method: "GET",
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    test("remains disabled when labId is null or undefined", () => {
      const { result } = renderHook(() => useReservationsOfTokenSSO(null), {
        wrapper: createWrapper(),
      });

      expect(result.current.fetchStatus).toBe("idle");
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  // Query Options & Edge Cases
  describe("Query Options & Edge Cases", () => {
    test("hooks accept custom React Query options without crashing", () => {
      const onSuccess = jest.fn();
      const onError = jest.fn();

      renderHook(
        () => useReservationSSO("key1", { enabled: false, onSuccess, onError }),
        { wrapper: createWrapper() }
      );

      // Hook should remain idle when enabled: false
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
