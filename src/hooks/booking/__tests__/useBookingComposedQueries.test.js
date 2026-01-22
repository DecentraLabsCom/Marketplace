/**
 * Unit Tests for Booking Composed Hooks
 *
 * Tests public cache extraction helper functions that filter and extract
 * booking data from composed hook results.
 *
 * Tests Behaviors:
 * - Cache extraction by reservation key
 * - Filtering by status category
 * - Status-specific extractors (active, upcoming, completed, cancelled)
 * - Edge cases and data validation
 */

import {
  extractBookingFromUser,
  extractBookingsByStatus,
  extractActiveBookings,
  extractUpcomingBookings,
  extractCompletedBookings,
  extractCancelledBookings,
  useUserBookingsDashboard,
  useLabBookingsDashboard,
} from "../useBookingComposedQueries";

// Testing library imports
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock logger
jest.mock("@/utils/dev/logger", () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    moduleLoaded: jest.fn(),
  },
}));

// Mock dependencies
jest.mock("@/utils/hooks/getIsSSO", () => ({
  useGetIsSSO: jest.fn(() => true),
}));

jest.mock("@/utils/hooks/useProviderMapping", () => ({
  useProviderMapping: jest.fn(() => ({})),
}));

jest.mock("@/hooks/lab/useLabAtomicQueries", () => ({
  useLabSSO: jest.fn(() => ({ data: null, isLoading: false })),
  useLabOwnerSSO: jest.fn(() => ({ data: null, isLoading: false })),
  useLab: jest.fn(() => ({ data: null, isLoading: false })),
  LAB_QUERY_CONFIG: {},
}));

jest.mock("@/hooks/metadata/useMetadata", () => ({
  useMetadata: jest.fn(() => ({ data: null, isLoading: false })),
  METADATA_QUERY_CONFIG: {},
}));

jest.mock("../useBookingAtomicQueries", () => ({
  useReservationsOf: jest.fn(),
  useReservationsOfSSO: jest.fn(),
  useReservationsOfWallet: jest.fn(),
  useReservationSSO: { queryFn: jest.fn() },
  useReservationsOfToken: jest.fn(),
  useReservationOfTokenByIndexSSO: { queryFn: jest.fn() },
  useReservationKeyOfUserByIndexSSO: { queryFn: jest.fn() },
  useReservationKeyOfUserByIndex: { queryFn: jest.fn() },
  useReservation: { queryFn: jest.fn() },
  BOOKING_QUERY_CONFIG: {},
}));

jest.mock("@tanstack/react-query", () => {
  const actual = jest.requireActual("@tanstack/react-query");

  return {
    ...actual,
    useQueries: jest.fn(() => []),
    useQueryClient: jest.fn(() => ({
      getQueryData: jest.fn(() => []),
    })),
  };
});

const mockUseReservationsOf = require("../useBookingAtomicQueries").useReservationsOf;
const mockUseReservationsOfSSO = require("../useBookingAtomicQueries").useReservationsOfSSO;
const mockUseReservationsOfWallet = require("../useBookingAtomicQueries").useReservationsOfWallet;
const mockUseReservationsOfToken = require("../useBookingAtomicQueries").useReservationsOfToken;

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return ({ children }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe("Booking Composed Hooks - Cache Extraction Helpers", () => {
  describe("extractBookingFromUser", () => {
    test("extracts booking by reservation key", () => {
      const userBookingsResult = {
        data: {
          bookings: [
            { reservationKey: "key1", labId: "1", status: 1 },
            { reservationKey: "key2", labId: "2", status: 2 },
            { reservationKey: "key3", labId: "3", status: 3 },
          ],
        },
      };

      const result = extractBookingFromUser(userBookingsResult, "key2");

      expect(result).toEqual({
        reservationKey: "key2",
        labId: "2",
        status: 2,
      });
    });

    test("returns null when booking not found", () => {
      const userBookingsResult = {
        data: {
          bookings: [{ reservationKey: "key1", labId: "1", status: 1 }],
        },
      };

      const result = extractBookingFromUser(userBookingsResult, "nonexistent");

      expect(result).toBeNull();
    });

    test("returns null when bookings array is empty", () => {
      const userBookingsResult = {
        data: {
          bookings: [],
        },
      };

      const result = extractBookingFromUser(userBookingsResult, "key1");

      expect(result).toBeNull();
    });

    test("returns null when result structure is invalid", () => {
      expect(extractBookingFromUser(null, "key1")).toBeNull();
      expect(extractBookingFromUser({}, "key1")).toBeNull();
      expect(extractBookingFromUser({ data: {} }, "key1")).toBeNull();
    });

    test("returns null when reservation key is not provided", () => {
      const userBookingsResult = {
        data: {
          bookings: [{ reservationKey: "key1", labId: "1" }],
        },
      };

      expect(extractBookingFromUser(userBookingsResult, null)).toBeNull();
      expect(extractBookingFromUser(userBookingsResult, undefined)).toBeNull();
      expect(extractBookingFromUser(userBookingsResult, "")).toBeNull();
    });

    test("handles bookings with additional properties", () => {
      const userBookingsResult = {
        data: {
          bookings: [
            {
              reservationKey: "key1",
              labId: "1",
              status: 1,
              start: 1234567890,
              end: 1234567900,
              labDetails: { name: "Lab A" },
            },
          ],
        },
      };

      const result = extractBookingFromUser(userBookingsResult, "key1");

      expect(result).toEqual({
        reservationKey: "key1",
        labId: "1",
        status: 1,
        start: 1234567890,
        end: 1234567900,
        labDetails: { name: "Lab A" },
      });
    });

    test("returns first match when duplicate reservation keys exist", () => {
      const userBookingsResult = {
        data: {
          bookings: [
            { reservationKey: "key1", labId: "1", status: 1 },
            { reservationKey: "key1", labId: "2", status: 2 }, // Duplicate
          ],
        },
      };

      const result = extractBookingFromUser(userBookingsResult, "key1");

      expect(result.labId).toBe("1");
    });
  });

  describe("extractBookingsByStatus", () => {
    const mockBookingsResult = {
      data: {
        bookings: [
          { reservationKey: "key1", statusCategory: "active", status: 1 },
          { reservationKey: "key2", statusCategory: "completed", status: 3 },
          { reservationKey: "key3", statusCategory: "active", status: 1 },
          { reservationKey: "key4", statusCategory: "cancelled", status: 5 },
          { reservationKey: "key5", statusCategory: "upcoming", status: 1 },
          { reservationKey: "key6", statusCategory: "pending", status: 0 },
        ],
      },
    };

    test("filters bookings by active status", () => {
      const result = extractBookingsByStatus(mockBookingsResult, "active");

      expect(result).toHaveLength(2);
      expect(result[0].reservationKey).toBe("key1");
      expect(result[1].reservationKey).toBe("key3");
    });

    test("filters bookings by completed status", () => {
      const result = extractBookingsByStatus(mockBookingsResult, "completed");

      expect(result).toHaveLength(1);
      expect(result[0].reservationKey).toBe("key2");
    });

    test("filters bookings by cancelled status", () => {
      const result = extractBookingsByStatus(mockBookingsResult, "cancelled");

      expect(result).toHaveLength(1);
      expect(result[0].reservationKey).toBe("key4");
    });

    test("filters bookings by upcoming status", () => {
      const result = extractBookingsByStatus(mockBookingsResult, "upcoming");

      expect(result).toHaveLength(1);
      expect(result[0].reservationKey).toBe("key5");
    });

    test("filters bookings by pending status", () => {
      const result = extractBookingsByStatus(mockBookingsResult, "pending");

      expect(result).toHaveLength(1);
      expect(result[0].reservationKey).toBe("key6");
    });

    test("returns empty array when no bookings match status", () => {
      const result = extractBookingsByStatus(mockBookingsResult, "unknown");

      expect(result).toEqual([]);
    });

    test("returns empty array when bookings array is empty", () => {
      const emptyResult = { data: { bookings: [] } };
      const result = extractBookingsByStatus(emptyResult, "active");

      expect(result).toEqual([]);
    });

    test("returns empty array when status is not provided", () => {
      expect(extractBookingsByStatus(mockBookingsResult, null)).toEqual([]);
      expect(extractBookingsByStatus(mockBookingsResult, undefined)).toEqual(
        []
      );
      expect(extractBookingsByStatus(mockBookingsResult, "")).toEqual([]);
    });

    test("returns empty array when result structure is invalid", () => {
      expect(extractBookingsByStatus(null, "active")).toEqual([]);
      expect(extractBookingsByStatus({}, "active")).toEqual([]);
      expect(extractBookingsByStatus({ data: {} }, "active")).toEqual([]);
    });

    test("status filtering is case-sensitive", () => {
      const bookingsResult = {
        data: {
          bookings: [
            { reservationKey: "key1", statusCategory: "Active" }, // Capital A
            { reservationKey: "key2", statusCategory: "active" },
          ],
        },
      };

      const result = extractBookingsByStatus(bookingsResult, "active");

      expect(result).toHaveLength(1);
      expect(result[0].reservationKey).toBe("key2");
    });

    test("preserves all booking properties in filtered results", () => {
      const result = extractBookingsByStatus(mockBookingsResult, "active");

      expect(result[0]).toHaveProperty("reservationKey");
      expect(result[0]).toHaveProperty("statusCategory");
      expect(result[0]).toHaveProperty("status");
    });
  });

  describe("extractActiveBookings", () => {
    test("extracts only active bookings", () => {
      const bookingsResult = {
        data: {
          bookings: [
            { reservationKey: "key1", statusCategory: "active" },
            { reservationKey: "key2", statusCategory: "completed" },
            { reservationKey: "key3", statusCategory: "active" },
          ],
        },
      };

      const result = extractActiveBookings(bookingsResult);

      expect(result).toHaveLength(2);
      expect(result[0].statusCategory).toBe("active");
      expect(result[1].statusCategory).toBe("active");
    });

    test("returns empty array when no active bookings", () => {
      const bookingsResult = {
        data: {
          bookings: [{ reservationKey: "key1", statusCategory: "completed" }],
        },
      };

      const result = extractActiveBookings(bookingsResult);

      expect(result).toEqual([]);
    });

    test("returns empty array for invalid input", () => {
      expect(extractActiveBookings(null)).toEqual([]);
      expect(extractActiveBookings({})).toEqual([]);
    });
  });

  describe("extractUpcomingBookings", () => {
    test("extracts only upcoming bookings", () => {
      const bookingsResult = {
        data: {
          bookings: [
            { reservationKey: "key1", statusCategory: "upcoming" },
            { reservationKey: "key2", statusCategory: "active" },
            { reservationKey: "key3", statusCategory: "upcoming" },
          ],
        },
      };

      const result = extractUpcomingBookings(bookingsResult);

      expect(result).toHaveLength(2);
      expect(result.every((b) => b.statusCategory === "upcoming")).toBe(true);
    });

    test("returns empty array when no upcoming bookings", () => {
      const bookingsResult = {
        data: {
          bookings: [{ reservationKey: "key1", statusCategory: "active" }],
        },
      };

      const result = extractUpcomingBookings(bookingsResult);

      expect(result).toEqual([]);
    });
  });

  describe("extractCompletedBookings", () => {
    test("extracts only completed bookings", () => {
      const bookingsResult = {
        data: {
          bookings: [
            { reservationKey: "key1", statusCategory: "completed" },
            { reservationKey: "key2", statusCategory: "active" },
            { reservationKey: "key3", statusCategory: "completed" },
          ],
        },
      };

      const result = extractCompletedBookings(bookingsResult);

      expect(result).toHaveLength(2);
      expect(result.every((b) => b.statusCategory === "completed")).toBe(true);
    });

    test("returns empty array when no completed bookings", () => {
      const bookingsResult = {
        data: {
          bookings: [{ reservationKey: "key1", statusCategory: "active" }],
        },
      };

      const result = extractCompletedBookings(bookingsResult);

      expect(result).toEqual([]);
    });
  });

  describe("extractCancelledBookings", () => {
    test("extracts only cancelled bookings", () => {
      const bookingsResult = {
        data: {
          bookings: [
            { reservationKey: "key1", statusCategory: "cancelled" },
            { reservationKey: "key2", statusCategory: "active" },
            { reservationKey: "key3", statusCategory: "cancelled" },
          ],
        },
      };

      const result = extractCancelledBookings(bookingsResult);

      expect(result).toHaveLength(2);
      expect(result.every((b) => b.statusCategory === "cancelled")).toBe(true);
    });

    test("returns empty array when no cancelled bookings", () => {
      const bookingsResult = {
        data: {
          bookings: [{ reservationKey: "key1", statusCategory: "active" }],
        },
      };

      const result = extractCancelledBookings(bookingsResult);

      expect(result).toEqual([]);
    });
  });

  describe("Edge Cases", () => {
    test("handles bookings with missing statusCategory", () => {
      const bookingsResult = {
        data: {
          bookings: [
            { reservationKey: "key1" }, // Missing statusCategory
            { reservationKey: "key2", statusCategory: "active" },
          ],
        },
      };

      const result = extractActiveBookings(bookingsResult);

      expect(result).toHaveLength(1);
      expect(result[0].reservationKey).toBe("key2");
    });

    test("handles null or undefined statusCategory", () => {
      const bookingsResult = {
        data: {
          bookings: [
            { reservationKey: "key1", statusCategory: null },
            { reservationKey: "key2", statusCategory: undefined },
            { reservationKey: "key3", statusCategory: "active" },
          ],
        },
      };

      const result = extractActiveBookings(bookingsResult);

      expect(result).toHaveLength(1);
      expect(result[0].reservationKey).toBe("key3");
    });

    test("handles very large booking arrays", () => {
      const largeBookingsResult = {
        data: {
          bookings: Array.from({ length: 1000 }, (_, i) => ({
            reservationKey: `key${i}`,
            statusCategory: i % 2 === 0 ? "active" : "completed",
          })),
        },
      };

      const activeBookings = extractActiveBookings(largeBookingsResult);
      const completedBookings = extractCompletedBookings(largeBookingsResult);

      expect(activeBookings).toHaveLength(500);
      expect(completedBookings).toHaveLength(500);
    });

    test("extraction preserves all booking properties", () => {
      const bookingsResult = {
        data: {
          bookings: [
            {
              reservationKey: "key1",
              statusCategory: "active",
              labId: "123",
              start: 1234567890,
              end: 1234567900,
              userAddress: "0x123...",
              labDetails: { name: "Lab A" },
              customField: "custom value",
            },
          ],
        },
      };

      const result = extractActiveBookings(bookingsResult);

      expect(result[0]).toEqual({
        reservationKey: "key1",
        statusCategory: "active",
        labId: "123",
        start: 1234567890,
        end: 1234567900,
        userAddress: "0x123...",
        labDetails: { name: "Lab A" },
        customField: "custom value",
      });
    });

    test("all status extractors work with same dataset", () => {
      const bookingsResult = {
        data: {
          bookings: [
            { reservationKey: "key1", statusCategory: "active" },
            { reservationKey: "key2", statusCategory: "upcoming" },
            { reservationKey: "key3", statusCategory: "completed" },
            { reservationKey: "key4", statusCategory: "cancelled" },
          ],
        },
      };

      expect(extractActiveBookings(bookingsResult)).toHaveLength(1);
      expect(extractUpcomingBookings(bookingsResult)).toHaveLength(1);
      expect(extractCompletedBookings(bookingsResult)).toHaveLength(1);
      expect(extractCancelledBookings(bookingsResult)).toHaveLength(1);
    });
  });

  describe("useUserBookingsDashboard", () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockUseReservationsOfSSO.mockReturnValue({
        data: { count: 0 },
        isLoading: false,
        isSuccess: true,
        error: null,
      });
      mockUseReservationsOfWallet.mockReturnValue({
        data: { count: 0 },
        isLoading: false,
        isSuccess: true,
        error: null,
      });
    });

    test("initializes with default options", () => {
      const { result } = renderHook(() => useUserBookingsDashboard("0x123"), { wrapper: createWrapper() });

      expect(result.current).toBeDefined();
      expect(mockUseReservationsOfSSO).toHaveBeenCalled();
    });

    test("handles user with reservations", () => {
      mockUseReservationsOfSSO.mockReturnValue({
        data: { count: 2 },
        isLoading: false,
        isSuccess: true,
        error: null,
      });

      const { result } = renderHook(() => useUserBookingsDashboard("0x123"), { wrapper: createWrapper() });

      expect(result.current.data.total).toBe(2);
      expect(result.current.meta.reservationCount).toBe(2);
    });

    test("applies limit when specified", () => {
      mockUseReservationsOfSSO.mockReturnValue({
        data: { count: 10 },
        isLoading: false,
        isSuccess: true,
        error: null,
      });

      const { result } = renderHook(() =>
        useUserBookingsDashboard("0x123", { limit: 5 }),
        { wrapper: createWrapper() }
      );

      expect(result.current.meta.reservationCount).toBe(5);
      expect(result.current.data.total).toBe(10);
    });

    test("handles zero reservations", () => {
      mockUseReservationsOf.mockReturnValue({
        data: { count: 0 },
        isLoading: false,
        isSuccess: true,
        error: null,
      });

      const { result } = renderHook(() => useUserBookingsDashboard("0x123"), { wrapper: createWrapper() });

      expect(result.current.data.total).toBe(0);
      expect(result.current.meta.reservationCount).toBe(0);
    });

    test("handles loading state", () => {
      mockUseReservationsOfSSO.mockReturnValue({
        data: undefined,
        isLoading: true,
        isSuccess: false,
        error: null,
      });

      const { result } = renderHook(() => useUserBookingsDashboard("0x123"), { wrapper: createWrapper() });

      expect(result.current.isLoading).toBe(true);
    });

    test("handles error state", () => {
      const mockError = new Error("Failed to fetch reservations");
      mockUseReservationsOfSSO.mockReturnValue({
        data: undefined,
        isLoading: false,
        isSuccess: false,
        error: mockError,
      });

      const { result } = renderHook(() => useUserBookingsDashboard("0x123"), { wrapper: createWrapper() });

      expect(result.current.error).toBe(mockError);
    });
  });

  describe("useLabBookingsDashboard", () => {
    test("initializes correctly", () => {
      mockUseReservationsOfToken.mockReturnValue({
        data: { count: 0 },
        isLoading: false,
        isSuccess: true,
        error: null,
      });

      const { result } = renderHook(() => useLabBookingsDashboard("lab123"), { wrapper: createWrapper() });

      expect(result.current).toBeDefined();
    });
  });
});
