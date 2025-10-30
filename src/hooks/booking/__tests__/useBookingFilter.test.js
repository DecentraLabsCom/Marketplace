/**
 * Unit Tests for useBookingFilter hook.
 *
 * Tests the booking filtering and calendar day highlighting hook.
 *
 * Tests Behaviors:
 *
 * - Initial State: Default parameters and empty arrays handling
 * - Booking Filtering: Filters bookings by display mode
 * - Day Highlighting: Determines CSS class based on booking status
 * - Status Logic: Pending vs confirmed booking classification
 * - Date Matching: Highlights days with matching bookings
 * - Edge Cases: Null/undefined/invalid inputs handling
 * - Multiple Bookings: Handles multiple bookings per day
 *
 */

import { renderHook } from "@testing-library/react";
import { useBookingFilter } from "../useBookingFilter";

// External utilities and date functions used by the hook
import {
  filterBookingsByDisplayMode,
  isPendingBooking,
  isConfirmedBooking,
} from "@/utils/booking/bookingStatus";
import { isSameCalendarDay } from "@/utils/dates/parseDateSafe";
import devLog from "@/utils/dev/logger";

// Mock booking status utilities to test filtering logic in isolation
jest.mock("@/utils/booking/bookingStatus");

// Mock date comparison functions to control time-based test scenarios
jest.mock("@/utils/dates/parseDateSafe");

// Mock development logger to reduce test output noise and control logging behavior
jest.mock("@/utils/dev/logger");

describe("useBookingFilter", () => {
  const mockBookings = [
    { id: "1", date: "2025-01-15", status: 0, labName: "AI Lab" },
    { id: "2", date: "2025-01-16", status: 1, labName: "Quantum Lab" },
    { id: "3", date: "2025-01-17", status: 0, labName: "Bio Lab" },
  ];

  const testDate = new Date("2025-01-15");

  beforeEach(() => {
    jest.clearAllMocks();
    filterBookingsByDisplayMode.mockImplementation((bookings) => bookings);
    isPendingBooking.mockImplementation((booking) => booking.status === 0);
    isConfirmedBooking.mockImplementation((booking) => booking.status === 1);
    isSameCalendarDay.mockImplementation((date1, date2) => date1 === date2);
    devLog.log = jest.fn();
  });

  describe("Initial State", () => {
    test("initializes with default parameters", () => {
      const { result } = renderHook(() => useBookingFilter());

      expect(result.current.filteredBookings).toEqual([]);
      expect(result.current.dayClassName).toBeDefined();
      expect(typeof result.current.dayClassName).toBe("function");
    });

    test("returns empty array when bookingInfo is empty", () => {
      const { result } = renderHook(() => useBookingFilter([]));

      expect(result.current.filteredBookings).toEqual([]);
    });

    test("handles undefined bookingInfo gracefully", () => {
      const { result } = renderHook(() => useBookingFilter(undefined));

      expect(result.current.filteredBookings).toEqual([]);
    });

    test("handles null bookingInfo gracefully", () => {
      const { result } = renderHook(() => useBookingFilter(null));

      expect(result.current.filteredBookings).toEqual([]);
    });

    test("handles non-array bookingInfo by converting to empty array", () => {
      const { result } = renderHook(() => useBookingFilter("not-an-array"));

      expect(result.current.filteredBookings).toEqual([]);
    });
  });

  describe("Booking Filtering", () => {
    test("filters bookings using display mode", () => {
      const filteredMock = [mockBookings[0], mockBookings[1]];
      filterBookingsByDisplayMode.mockReturnValue(filteredMock);

      const { result } = renderHook(() =>
        useBookingFilter(mockBookings, "confirmed")
      );

      expect(filterBookingsByDisplayMode).toHaveBeenCalledWith(
        mockBookings,
        "confirmed"
      );
      expect(result.current.filteredBookings).toEqual(filteredMock);
    });

    test("uses default display mode when not provided", () => {
      const { result } = renderHook(() => useBookingFilter(mockBookings));

      expect(filterBookingsByDisplayMode).toHaveBeenCalledWith(
        mockBookings,
        "default"
      );
    });

    test("returns all bookings when filter does not exclude any", () => {
      filterBookingsByDisplayMode.mockReturnValue(mockBookings);

      const { result } = renderHook(() => useBookingFilter(mockBookings));

      expect(result.current.filteredBookings).toHaveLength(3);
    });
  });

  describe("Day Highlighting - No Bookings", () => {
    test("returns undefined for days without bookings", () => {
      isSameCalendarDay.mockReturnValue(false);

      const { result } = renderHook(() => useBookingFilter(mockBookings));

      const className = result.current.dayClassName(testDate);

      expect(className).toBeUndefined();
    });
  });

  describe("Day Highlighting - Confirmed Bookings", () => {
    test("returns highlight class for days with confirmed bookings", () => {
      isSameCalendarDay.mockImplementation(
        (bookingDate, day) => bookingDate === "2025-01-16" && day === testDate
      );
      filterBookingsByDisplayMode.mockReturnValue([mockBookings[1]]);

      const { result } = renderHook(() => useBookingFilter(mockBookings));

      const className = result.current.dayClassName(testDate);

      expect(className).toBe("bg-[#9fc6f5] text-white");
    });

    test("uses custom highlight class when provided", () => {
      isSameCalendarDay.mockImplementation(
        (bookingDate, day) => bookingDate === "2025-01-16" && day === testDate
      );
      filterBookingsByDisplayMode.mockReturnValue([mockBookings[1]]);

      const { result } = renderHook(() =>
        useBookingFilter(mockBookings, "default", "bg-blue-500")
      );

      const className = result.current.dayClassName(testDate);

      expect(className).toBe("bg-blue-500");
    });
  });

  describe("Day Highlighting - Pending Bookings", () => {
    test("returns highlight with pending class when all bookings are pending", () => {
      isSameCalendarDay.mockImplementation(
        (bookingDate, day) => bookingDate === "2025-01-15" && day === testDate
      );
      filterBookingsByDisplayMode.mockReturnValue([mockBookings[0]]);

      const { result } = renderHook(() => useBookingFilter(mockBookings));

      const className = result.current.dayClassName(testDate);

      expect(className).toBe("bg-[#9fc6f5] text-white pending-booking");
    });

    test("returns standard highlight when bookings are mixed pending and confirmed", () => {
      const mixedBookings = [
        { id: "1", date: "2025-01-15", status: 0 },
        { id: "2", date: "2025-01-15", status: 1 },
      ];

      isSameCalendarDay.mockReturnValue(true);
      filterBookingsByDisplayMode.mockReturnValue(mixedBookings);

      const { result } = renderHook(() => useBookingFilter(mixedBookings));

      const className = result.current.dayClassName(testDate);

      expect(className).toBe("bg-[#9fc6f5] text-white");
    });
  });

  describe("Multiple Bookings Per Day", () => {
    test("handles multiple pending bookings on same day", () => {
      const multiplePending = [
        { id: "1", date: "2025-01-15", status: 0 },
        { id: "2", date: "2025-01-15", status: 0 },
        { id: "3", date: "2025-01-15", status: 0 },
      ];

      isSameCalendarDay.mockReturnValue(true);
      filterBookingsByDisplayMode.mockReturnValue(multiplePending);

      const { result } = renderHook(() => useBookingFilter(multiplePending));

      const className = result.current.dayClassName(testDate);

      expect(className).toBe("bg-[#9fc6f5] text-white pending-booking");
    });

    test("handles multiple confirmed bookings on same day", () => {
      const multipleConfirmed = [
        { id: "1", date: "2025-01-15", status: 1 },
        { id: "2", date: "2025-01-15", status: 1 },
      ];

      isSameCalendarDay.mockReturnValue(true);
      filterBookingsByDisplayMode.mockReturnValue(multipleConfirmed);

      const { result } = renderHook(() => useBookingFilter(multipleConfirmed));

      const className = result.current.dayClassName(testDate);

      expect(className).toBe("bg-[#9fc6f5] text-white");
    });

    test("prioritizes confirmed over pending when both exist", () => {
      const mixedStatusBookings = [
        { id: "1", date: "2025-01-15", status: 0 },
        { id: "2", date: "2025-01-15", status: 0 },
        { id: "3", date: "2025-01-15", status: 1 },
      ];

      isSameCalendarDay.mockReturnValue(true);
      filterBookingsByDisplayMode.mockReturnValue(mixedStatusBookings);

      const { result } = renderHook(() =>
        useBookingFilter(mixedStatusBookings)
      );

      const className = result.current.dayClassName(testDate);

      expect(className).toBe("bg-[#9fc6f5] text-white");
    });
  });

  describe("Date Matching Integration", () => {
    test("calls isSameCalendarDay for each booking when checking day", () => {
      filterBookingsByDisplayMode.mockReturnValue(mockBookings);
      isSameCalendarDay.mockReturnValue(false);

      const { result } = renderHook(() => useBookingFilter(mockBookings));

      result.current.dayClassName(testDate);

      expect(isSameCalendarDay).toHaveBeenCalledTimes(3);
    });

    test("correctly identifies matching day from multiple bookings", () => {
      isSameCalendarDay.mockImplementation(
        (bookingDate, day) => bookingDate === "2025-01-16"
      );
      filterBookingsByDisplayMode.mockReturnValue(mockBookings);

      const { result } = renderHook(() => useBookingFilter(mockBookings));

      const className = result.current.dayClassName(testDate);

      expect(className).toBe("bg-[#9fc6f5] text-white");
    });
  });

  describe("Memoization Stability", () => {
    test("dayClassName function remains stable when inputs unchanged", () => {
      const { result, rerender } = renderHook(() =>
        useBookingFilter(mockBookings, "default", "bg-blue-500")
      );

      const firstDayClassName = result.current.dayClassName;
      rerender();
      const secondDayClassName = result.current.dayClassName;

      expect(firstDayClassName).toBe(secondDayClassName);
    });

    test("filteredBookings remain stable when inputs unchanged", () => {
      filterBookingsByDisplayMode.mockReturnValue(mockBookings);

      const { result, rerender } = renderHook(() =>
        useBookingFilter(mockBookings, "default")
      );

      const firstFiltered = result.current.filteredBookings;
      rerender();
      const secondFiltered = result.current.filteredBookings;

      expect(firstFiltered).toBe(secondFiltered);
    });
  });

  describe("Edge Cases", () => {
    test("handles bookings with missing status field", () => {
      const invalidBooking = [{ id: "1", date: "2025-01-15" }];

      isSameCalendarDay.mockReturnValue(true);
      filterBookingsByDisplayMode.mockReturnValue(invalidBooking);
      isPendingBooking.mockReturnValue(false);
      isConfirmedBooking.mockReturnValue(false);

      const { result } = renderHook(() => useBookingFilter(invalidBooking));

      const className = result.current.dayClassName(testDate);

      expect(className).toBe("bg-[#9fc6f5] text-white");
    });

    test("handles empty filtered results", () => {
      filterBookingsByDisplayMode.mockReturnValue([]);

      const { result } = renderHook(() => useBookingFilter(mockBookings));

      expect(result.current.filteredBookings).toEqual([]);

      const className = result.current.dayClassName(testDate);
      expect(className).toBeUndefined();
    });
  });
});
