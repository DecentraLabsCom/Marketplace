/**
 * Unit Tests for Booking Status Utilities
 *
 * Tests pure utility functions for booking status, date validation, and filtering.
 * Focuses on business logic, edge cases, and critical date calculations.
 *
 * Test Behaviors:
 * - Status checking functions (cancelled, used, pending, confirmed)
 * - Display utilities (text, color, icon mapping)
 * - Date validation with multiple fallback strategies
 * - Past booking calculation with edge cases
 * - Complex filtering logic by display mode
 */

import {
  BOOKING_STATUS,
  isCancelledBooking,
  isUsedBooking,
  isCollectedBooking,
  isPendingBooking,
  isConfirmedBooking,
  getBookingStatusText,
  getBookingStatusColor,
  getBookingStatusDisplay,
  isPastBooking,
  hasValidDate,
  filterBookingsByDisplayMode,
} from "../bookingStatus";

jest.mock("@/utils/dev/logger", () => ({
  warn: jest.fn(),
  log: jest.fn(),
}));

describe("Status Checking Functions", () => {
  describe("isCancelledBooking", () => {
    test.each([
      [4, true],
      ["4", true],
      [BOOKING_STATUS.CANCELLED, true],
      [0, false],
      [1, false],
      [2, false],
    ])("returns %s for status=%s", (status, expected) => {
      const booking = { status };

      expect(isCancelledBooking(booking)).toBe(expected);
    });
  });

  describe("isUsedBooking", () => {
    test.each([
      [2, true],
      ["2", true],
      [0, false],
      [1, false],
      [4, false],
    ])("returns %s for status=%s", (status, expected) => {
      const booking = { status };

      expect(isUsedBooking(booking)).toBe(expected);
    });
  });

  describe("isPendingBooking", () => {
    test.each([
      [0, true],
      ["0", true],
      [BOOKING_STATUS.PENDING, true],
      [1, false],
      [4, false],
    ])("returns %s for status=%s", (status, expected) => {
      const booking = { status };

      expect(isPendingBooking(booking)).toBe(expected);
    });
  });

  describe("isConfirmedBooking", () => {
    test.each([
      [1, true],
      ["1", true],
      [BOOKING_STATUS.CONFIRMED, true],
      [0, false],
      [4, false],
    ])("returns %s for status=%s", (status, expected) => {
      const booking = { status };

      expect(isConfirmedBooking(booking)).toBe(expected);
    });
  });
});

describe("Display Utilities", () => {
  describe("getBookingStatusText", () => {
    test.each([
      [0, "Pending"],
      [1, "Confirmed"],
      [2, "Used"],
      [3, "Collected"],
      [4, "Cancelled"],
      [99, "Unknown"],
      ["1", "Confirmed"], // string number
    ])("returns correct text for status=%s", (status, expected) => {
      const booking = { status };

      expect(getBookingStatusText(booking)).toBe(expected);
    });
  });

  describe("getBookingStatusDisplay", () => {
    test("returns correct display object for pending status", () => {
      const booking = { status: 0 };

      const display = getBookingStatusDisplay(booking);

      expect(display.text).toBe("Pending");
      expect(display.icon).toBe("⏳");

      expect(display.className).toBe(
        "bg-booking-pending-bg text-booking-pending-text border-booking-pending-border"
      );
    });

    describe("getBookingStatusColor", () => {
      test.each([
        [0, "text-warning"],
        [1, "text-success"],
        [2, "text-info"],
        [3, "text-neutral-600"],
        [4, "text-error"],
        [99, "text-neutral-400"],
      ])("returns correct color for status=%s", (status, expected) => {
        expect(getBookingStatusColor({ status })).toBe(expected);
      });
    });

    test("returns correct display object for confirmed status", () => {
      const booking = { status: 1 };

      const display = getBookingStatusDisplay(booking);

      expect(display.text).toBe("Confirmed");
      expect(display.icon).toBe("✓");
    });

    test("returns unknown display for invalid status", () => {
      const booking = { status: 999 };

      const display = getBookingStatusDisplay(booking);

      expect(display.text).toBe("Unknown");
      expect(display.icon).toBe("❓");
    });
  });
});

describe("Date Validation", () => {
  describe("hasValidDate", () => {
    test("returns true when booking has valid date field", () => {
      const booking = { date: "2024-01-15" };

      expect(hasValidDate(booking)).toBe(true);
    });

    test("falls back to startDate when date missing", () => {
      const booking = { startDate: "2024-01-15T10:00:00" };

      const result = hasValidDate(booking);

      expect(result).toBe(true);
      expect(booking.date).toBeDefined(); // should add date field
    });

    test("falls back to start timestamp when date and startDate missing", () => {
      const timestamp = Math.floor(new Date("2024-01-15").getTime() / 1000);
      const booking = { start: timestamp };

      const result = hasValidDate(booking);

      expect(result).toBe(true);
      expect(booking.date).toBeDefined();
    });

    test("returns false when all date fields invalid", () => {
      const booking = { date: "invalid-date", startDate: null, start: null };

      expect(hasValidDate(booking)).toBe(false);
    });

    test("returns false when booking has no date fields", () => {
      const booking = { id: "123", status: 1 };

      expect(hasValidDate(booking)).toBe(false);
    });

    test("handles zero or negative timestamps correctly", () => {
      const booking = { start: 0 };

      expect(hasValidDate(booking)).toBe(false);
    });
  });
});

describe("Past Booking Calculation", () => {
  describe("isPastBooking", () => {
    test("returns true when end timestamp is in the past", () => {
      const yesterday = Math.floor(Date.now() / 1000) - 86400; // 1 day ago
      const booking = { start: yesterday - 3600, end: yesterday };

      expect(isPastBooking(booking)).toBe(true);
    });

    test("returns false when end timestamp is in the future", () => {
      const tomorrow = Math.floor(Date.now() / 1000) + 86400; // 1 day ahead
      const booking = { start: tomorrow - 3600, end: tomorrow };

      expect(isPastBooking(booking)).toBe(false);
    });

    test("uses date field when timestamps missing", () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const booking = { date: yesterday.toISOString() };

      expect(isPastBooking(booking)).toBe(true);
    });

    test("returns false when date is today", () => {
      const today = new Date().toISOString();
      const booking = { date: today };

      expect(isPastBooking(booking)).toBe(false);
    });

    test("returns false when date calculation fails", () => {
      const booking = { date: "completely-invalid" };

      expect(isPastBooking(booking)).toBe(false);
    });

    test("handles missing date and timestamp gracefully", () => {
      const booking = { status: 1 };

      expect(isPastBooking(booking)).toBe(false);
    });
  });
});

describe("Filtering by Display Mode", () => {
  const now = Date.now();
  const pastTimestamp = Math.floor(now / 1000) - 86400; // 1 day ago
  const futureTimestamp = Math.floor(now / 1000) + 86400; // 1 day ahead

  const createBooking = (status, start, end) => ({
    id: Math.random(),
    status,
    start,
    end,
    date: new Date(start * 1000).toLocaleDateString("en-CA"),
  });

  describe("Common Rules Across All Modes", () => {
    test("always excludes cancelled bookings", () => {
      const bookings = [
        createBooking(4, futureTimestamp, futureTimestamp + 3600), // cancelled future
        createBooking(1, futureTimestamp, futureTimestamp + 3600), // confirmed future
      ];

      const result = filterBookingsByDisplayMode(bookings, "default");

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe(1);
    });

    test("excludes bookings without valid dates", () => {
      const bookings = [
        { id: 1, status: 1 }, // no date fields
        createBooking(1, futureTimestamp, futureTimestamp + 3600),
      ];

      const result = filterBookingsByDisplayMode(bookings, "default");

      expect(result).toHaveLength(1);
      expect(result[0].id).not.toBe(1);
    });

    test("handles empty bookings array", () => {
      const result = filterBookingsByDisplayMode([], "default");

      expect(result).toEqual([]);
    });
  });

  describe("lab-reservation Mode", () => {
    test("shows pending and confirmed future bookings only", () => {
      const bookings = [
        createBooking(0, futureTimestamp, futureTimestamp + 3600), // pending future
        createBooking(1, futureTimestamp, futureTimestamp + 3600), // confirmed future
        createBooking(0, pastTimestamp, pastTimestamp + 3600), // pending past
        createBooking(1, pastTimestamp, pastTimestamp + 3600), // confirmed past
      ];

      const result = filterBookingsByDisplayMode(bookings, "lab-reservation");

      expect(result).toHaveLength(2);
      expect(result.every((b) => !isPastBooking(b))).toBe(true);
    });

    test("excludes past bookings regardless of status", () => {
      const bookings = [
        createBooking(1, pastTimestamp, pastTimestamp + 3600),
        createBooking(0, pastTimestamp, pastTimestamp + 3600),
      ];

      const result = filterBookingsByDisplayMode(bookings, "lab-reservation");

      expect(result).toHaveLength(0);
    });
  });

  describe("user-dashboard Mode", () => {
    test("shows confirmed past bookings", () => {
      const bookings = [
        createBooking(1, pastTimestamp, pastTimestamp + 3600), // confirmed past
        createBooking(0, pastTimestamp, pastTimestamp + 3600), // pending past
      ];

      const result = filterBookingsByDisplayMode(bookings, "user-dashboard");

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe(1);
    });

    test("shows confirmed and pending future bookings", () => {
      const bookings = [
        createBooking(0, futureTimestamp, futureTimestamp + 3600), // pending future
        createBooking(1, futureTimestamp, futureTimestamp + 3600), // confirmed future
        createBooking(2, futureTimestamp, futureTimestamp + 3600), // used future
      ];

      const result = filterBookingsByDisplayMode(bookings, "user-dashboard");

      expect(result).toHaveLength(2);
      expect(result.some((b) => b.status === 0)).toBe(true);
      expect(result.some((b) => b.status === 1)).toBe(true);
    });

    test("excludes past pending bookings", () => {
      const bookings = [createBooking(0, pastTimestamp, pastTimestamp + 3600)];

      const result = filterBookingsByDisplayMode(bookings, "user-dashboard");

      expect(result).toHaveLength(0);
    });
  });

  describe("provider-dashboard Mode", () => {
    test("applies same rules as user-dashboard", () => {
      const bookings = [
        createBooking(0, futureTimestamp, futureTimestamp + 3600),
        createBooking(1, futureTimestamp, futureTimestamp + 3600),
        createBooking(1, pastTimestamp, pastTimestamp + 3600),
        createBooking(0, pastTimestamp, pastTimestamp + 3600),
      ];

      const userResult = filterBookingsByDisplayMode(
        bookings,
        "user-dashboard"
      );
      const providerResult = filterBookingsByDisplayMode(
        bookings,
        "provider-dashboard"
      );

      expect(providerResult).toEqual(userResult);
    });
  });

  describe("default Mode", () => {
    test("shows all bookings except past pending", () => {
      const bookings = [
        createBooking(0, futureTimestamp, futureTimestamp + 3600), // pending future - show
        createBooking(1, futureTimestamp, futureTimestamp + 3600), // confirmed future - show
        createBooking(1, pastTimestamp, pastTimestamp + 3600), // confirmed past - show
        createBooking(0, pastTimestamp, pastTimestamp + 3600), // pending past - hide
      ];

      const result = filterBookingsByDisplayMode(bookings, "default");

      expect(result).toHaveLength(3);
      expect(result.some((b) => b.status === 0 && isPastBooking(b))).toBe(
        false
      );
    });

    test("shows used and collected bookings", () => {
      const bookings = [
        createBooking(2, pastTimestamp, pastTimestamp + 3600), // used
        createBooking(3, pastTimestamp, pastTimestamp + 3600), // collected
      ];

      const result = filterBookingsByDisplayMode(bookings, "default");

      expect(result).toHaveLength(2);
    });
  });
});
