/**
 * Unit Tests for useBookingCacheUpdates hook
 *
 * Tests the booking cache management hook for React Query.
 *
 * Test Behaviors:
 *
 * - Adding Bookings: Adds to all, byUser, and byLab caches
 * - Updating Bookings: Updates existing bookings in cache
 * - Removing Bookings: Removes bookings from cache
 * - Optimistic Operations: Add, replace, and remove optimistic bookings
 * - Smart Invalidation: Targeted cache invalidation with fallback
 * - Edge Cases: Null data, missing keys, empty caches
 *
 */

import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useBookingCacheUpdates } from "../useBookingCacheUpdates";
import { bookingQueryKeys } from "@/utils/hooks/queryKeys";

// Mock the query keys to avoid dependencies on the actual implementation
jest.mock("@/utils/hooks/queryKeys", () => ({
  bookingQueryKeys: {
    all: jest.fn(() => ["bookings", "all"]),
    byUserPrefix: jest.fn(() => ["bookings", "user"]),
    byUser: jest.fn((address) => ["bookings", "user", address]),
    byLabPrefix: jest.fn(() => ["bookings", "lab"]),
    byLab: jest.fn((labId) => ["bookings", "lab", labId]),
    byReservationKey: jest.fn((key) => ["bookings", "key", key]),
    reservationOfTokenRoot: jest.fn(() => ["bookings", "reservationOfToken"]),
  },
}));

describe("useBookingCacheUpdates", () => {
  let queryClient;
  let wrapper;
  // Sample booking data used across multiple tests
  const mockBooking = {
    id: "booking-1",
    reservationKey: "key-123",
    userAddress: "0xUser123",
    labId: "lab-1",
    start: "1704110400",
    status: 1,
  };

  // Set up a fresh QueryClient and wrapper before each test
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    wrapper = ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  });

  // Clear the cache after each test to avoid state leakage
  afterEach(() => {
    queryClient.clear();
  });

  describe("Adding Bookings", () => {
    test("adds booking to all bookings cache", () => {
      const { result } = renderHook(() => useBookingCacheUpdates(), {
        wrapper,
      });

      result.current.addBooking(mockBooking);

      const allBookings = queryClient.getQueryData(["bookings", "all"]);
      expect(allBookings).toEqual([mockBooking]);
    });

    test("adds booking to user-specific cache when userAddress provided", () => {
      const { result } = renderHook(() => useBookingCacheUpdates(), {
        wrapper,
      });

      result.current.addBooking(mockBooking);

      const userBookings = queryClient.getQueryData([
        "bookings",
        "user",
        "0xUser123",
      ]);
      expect(userBookings).toEqual([mockBooking]);
    });

    test("adds booking to lab-specific cache when labId provided", () => {
      const { result } = renderHook(() => useBookingCacheUpdates(), {
        wrapper,
      });

      result.current.addBooking(mockBooking);

      const labBookings = queryClient.getQueryData([
        "bookings",
        "lab",
        "lab-1",
      ]);
      expect(labBookings).toEqual([mockBooking]);
    });

    test("prepends new booking to existing bookings", () => {
      queryClient.setQueryData(["bookings", "all"], [mockBooking]);
      const { result } = renderHook(() => useBookingCacheUpdates(), {
        wrapper,
      });

      const newBooking = { ...mockBooking, id: "booking-2" };
      result.current.addBooking(newBooking);

      const allBookings = queryClient.getQueryData(["bookings", "all"]);
      expect(allBookings).toEqual([newBooking, mockBooking]);
    });

    test("handles adding booking when cache is empty", () => {
      const { result } = renderHook(() => useBookingCacheUpdates(), {
        wrapper,
      });

      result.current.addBooking(mockBooking);

      const allBookings = queryClient.getQueryData(["bookings", "all"]);
      expect(allBookings).toHaveLength(1);
    });
  });

  describe("Updating Bookings", () => {
    test("updates booking in all bookings cache by reservationKey", () => {
      queryClient.setQueryData(["bookings", "all"], [mockBooking]);
      const { result } = renderHook(() => useBookingCacheUpdates(), {
        wrapper,
      });

      const updatedBooking = { ...mockBooking, status: 2 };
      result.current.updateBooking("key-123", updatedBooking);

      const allBookings = queryClient.getQueryData(["bookings", "all"]);
      expect(allBookings[0].status).toBe(2);
    });

    test("updates booking by id when reservationKey not provided", () => {
      queryClient.setQueryData(["bookings", "all"], [mockBooking]);
      const { result } = renderHook(() => useBookingCacheUpdates(), {
        wrapper,
      });

      const updatedBooking = { ...mockBooking, status: 3 };
      result.current.updateBooking("booking-1", updatedBooking);

      const allBookings = queryClient.getQueryData(["bookings", "all"]);
      expect(allBookings[0].status).toBe(3);
    });

    test("returns empty array when cache is empty", () => {
      const { result } = renderHook(() => useBookingCacheUpdates(), {
        wrapper,
      });

      result.current.updateBooking("key-123", mockBooking);

      const allBookings = queryClient.getQueryData(["bookings", "all"]);
      expect(allBookings).toEqual([]);
    });
  });

  describe("Removing Bookings", () => {
    test("removes booking from cache by reservationKey", () => {
      queryClient.setQueryData(["bookings", "all"], [mockBooking]);
      const { result } = renderHook(() => useBookingCacheUpdates(), {
        wrapper,
      });

      result.current.removeBooking("key-123");

      const allBookings = queryClient.getQueryData(["bookings", "all"]);
      expect(allBookings).toEqual([]);
    });

    test("removes booking by id when reservationKey does not match", () => {
      queryClient.setQueryData(["bookings", "all"], [mockBooking]);
      const { result } = renderHook(() => useBookingCacheUpdates(), {
        wrapper,
      });

      result.current.removeBooking("booking-1");

      const allBookings = queryClient.getQueryData(["bookings", "all"]);
      expect(allBookings).toEqual([]);
    });

    test("handles removing from empty cache", () => {
      const { result } = renderHook(() => useBookingCacheUpdates(), {
        wrapper,
      });

      result.current.removeBooking("key-123");

      const allBookings = queryClient.getQueryData(["bookings", "all"]);
      expect(allBookings).toEqual([]);
    });
  });

  describe("Optimistic Bookings", () => {
    test("adds optimistic booking with temporary id and flags", () => {
      const { result } = renderHook(() => useBookingCacheUpdates(), {
        wrapper,
      });

      const bookingData = {
        labId: "lab-1",
        userAddress: "0xUser123",
        start: "1704110400",
      };
      const optimisticBooking =
        result.current.addOptimisticBooking(bookingData);

      expect(optimisticBooking.id).toContain("temp-");
      expect(optimisticBooking.isPending).toBe(true);
      expect(optimisticBooking.isProcessing).toBe(true);

      const allBookings = queryClient.getQueryData(["bookings", "all"]);
      expect(allBookings).toHaveLength(1);
    });

    test("replaces optimistic booking with real booking data", () => {
      const optimisticBooking = {
        id: "temp-123",
        labId: "lab-1",
        isPending: true,
      };
      queryClient.setQueryData(["bookings", "all"], [optimisticBooking]);

      const { result } = renderHook(() => useBookingCacheUpdates(), {
        wrapper,
      });

      result.current.replaceOptimisticBooking("temp-123", mockBooking);

      const allBookings = queryClient.getQueryData(["bookings", "all"]);
      expect(allBookings[0].id).toBe("booking-1");
      expect(allBookings[0].isPending).toBeUndefined();
    });

    test("removes optimistic booking from all caches", () => {
      const optimisticBooking = {
        id: "temp-456",
        labId: "lab-1",
        userAddress: "0xUser123",
      };
      queryClient.setQueryData(
        ["bookings", "all"],
        [optimisticBooking, mockBooking]
      );

      const { result } = renderHook(() => useBookingCacheUpdates(), {
        wrapper,
      });

      result.current.removeOptimisticBooking("temp-456");

      const allBookings = queryClient.getQueryData(["bookings", "all"]);
      expect(allBookings).toHaveLength(1);
      expect(allBookings[0].id).toBe("booking-1");
    });
  });

  describe("Smart Invalidation", () => {
    test("calls addBooking when action is add", () => {
      const { result } = renderHook(() => useBookingCacheUpdates(), {
        wrapper,
      });

      result.current.smartBookingInvalidation(
        "0xUser123",
        "lab-1",
        mockBooking,
        "add"
      );

      const allBookings = queryClient.getQueryData(["bookings", "all"]);
      expect(allBookings).toContain(mockBooking);
    });

    test("calls updateBooking when action is update", () => {
      queryClient.setQueryData(["bookings", "all"], [mockBooking]);
      const { result } = renderHook(() => useBookingCacheUpdates(), {
        wrapper,
      });

      const updatedBooking = { ...mockBooking, status: 2 };
      result.current.smartBookingInvalidation(
        "0xUser123",
        "lab-1",
        updatedBooking,
        "update"
      );

      const allBookings = queryClient.getQueryData(["bookings", "all"]);
      expect(allBookings[0].status).toBe(2);
    });

    test("calls removeBooking when action is remove", () => {
      queryClient.setQueryData(["bookings", "all"], [mockBooking]);
      const { result } = renderHook(() => useBookingCacheUpdates(), {
        wrapper,
      });

      result.current.smartBookingInvalidation(
        "0xUser123",
        "lab-1",
        mockBooking,
        "remove"
      );

      const allBookings = queryClient.getQueryData(["bookings", "all"]);
      expect(allBookings).toEqual([]);
    });

    test("handles smart invalidation without action parameter", () => {
      const { result } = renderHook(() => useBookingCacheUpdates(), {
        wrapper,
      });

      expect(() => {
        result.current.smartBookingInvalidation(
          "0xUser123",
          "lab-1",
          mockBooking
        );
      }).not.toThrow();
    });
  });

  describe("Edge Cases", () => {
    test("handles booking without userAddress", () => {
      const bookingNoUser = { ...mockBooking, userAddress: undefined };
      const { result } = renderHook(() => useBookingCacheUpdates(), {
        wrapper,
      });

      result.current.addBooking(bookingNoUser);

      const allBookings = queryClient.getQueryData(["bookings", "all"]);
      expect(allBookings).toHaveLength(1);
    });

    test("handles booking without labId", () => {
      const bookingNoLab = { ...mockBooking, labId: undefined };
      const { result } = renderHook(() => useBookingCacheUpdates(), {
        wrapper,
      });

      result.current.addBooking(bookingNoLab);

      const allBookings = queryClient.getQueryData(["bookings", "all"]);
      expect(allBookings).toHaveLength(1);
    });

    test("handles null booking data in smart invalidation", () => {
      const { result } = renderHook(() => useBookingCacheUpdates(), {
        wrapper,
      });

      expect(() => {
        result.current.smartBookingInvalidation(
          "0xUser123",
          "lab-1",
          null,
          "add"
        );
      }).not.toThrow();
    });
  });
});
