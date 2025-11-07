/**
 * Unit Tests for isBookingActive Utility
 *
 * Tests active booking detection logic.
 * Uses jest.useFakeTimers() to control time.
 *
 * Test Behaviors:
 * - Active booking detection
 * - Status validation (confirmed only)
 * - Time boundary checks
 * - Invalid input handling
 */

import isBookingActive from "../isBookingActive";

// Mock devLog to avoid console noise
jest.mock("@/utils/dev/logger", () => ({
  default: {
    log: jest.fn(),
  },
}));

describe("isBookingActive", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("Active bookings", () => {
    test("returns true when booking is active and confirmed", () => {
      jest.setSystemTime(new Date("2025-06-15T12:00:00"));

      const bookingStart = Math.floor(
        new Date("2025-06-15T10:00:00").getTime() / 1000
      );
      const bookingEnd = Math.floor(
        new Date("2025-06-15T14:00:00").getTime() / 1000
      );

      const bookingInfo = [
        {
          start: bookingStart,
          end: bookingEnd,
          status: 1,
          labId: "lab-123",
        },
      ];

      expect(isBookingActive(bookingInfo)).toBe(true);
    });

    test('returns true for status as string "1"', () => {
      jest.setSystemTime(new Date("2025-06-15T12:00:00"));

      const bookingStart = Math.floor(
        new Date("2025-06-15T10:00:00").getTime() / 1000
      );
      const bookingEnd = Math.floor(
        new Date("2025-06-15T14:00:00").getTime() / 1000
      );

      const bookingInfo = [
        {
          start: bookingStart,
          end: bookingEnd,
          status: "1",
        },
      ];

      expect(isBookingActive(bookingInfo)).toBe(true);
    });

    test("returns true when multiple bookings and one is active", () => {
      jest.setSystemTime(new Date("2025-06-15T12:00:00"));

      const pastStart = Math.floor(
        new Date("2025-06-15T08:00:00").getTime() / 1000
      );
      const pastEnd = Math.floor(
        new Date("2025-06-15T09:00:00").getTime() / 1000
      );
      const activeStart = Math.floor(
        new Date("2025-06-15T11:00:00").getTime() / 1000
      );
      const activeEnd = Math.floor(
        new Date("2025-06-15T13:00:00").getTime() / 1000
      );

      const bookingInfo = [
        { start: pastStart, end: pastEnd, status: 1 },
        { start: activeStart, end: activeEnd, status: 1 },
      ];

      expect(isBookingActive(bookingInfo)).toBe(true);
    });
  });

  describe("Inactive bookings", () => {
    test("returns false when booking is past", () => {
      jest.setSystemTime(new Date("2025-06-15T15:00:00"));

      const bookingStart = Math.floor(
        new Date("2025-06-15T10:00:00").getTime() / 1000
      );
      const bookingEnd = Math.floor(
        new Date("2025-06-15T12:00:00").getTime() / 1000
      );

      const bookingInfo = [
        {
          start: bookingStart,
          end: bookingEnd,
          status: 1,
        },
      ];

      expect(isBookingActive(bookingInfo)).toBe(false);
    });

    test("returns false when booking is future", () => {
      jest.setSystemTime(new Date("2025-06-15T09:00:00"));

      const bookingStart = Math.floor(
        new Date("2025-06-15T10:00:00").getTime() / 1000
      );
      const bookingEnd = Math.floor(
        new Date("2025-06-15T12:00:00").getTime() / 1000
      );

      const bookingInfo = [
        {
          start: bookingStart,
          end: bookingEnd,
          status: 1,
        },
      ];

      expect(isBookingActive(bookingInfo)).toBe(false);
    });

    test("returns false when status is not confirmed", () => {
      jest.setSystemTime(new Date("2025-06-15T12:00:00"));

      const bookingStart = Math.floor(
        new Date("2025-06-15T10:00:00").getTime() / 1000
      );
      const bookingEnd = Math.floor(
        new Date("2025-06-15T14:00:00").getTime() / 1000
      );

      const bookingInfo = [
        { start: bookingStart, end: bookingEnd, status: 0 },
        { start: bookingStart, end: bookingEnd, status: 2 },
        { start: bookingStart, end: bookingEnd, status: "0" },
      ];

      expect(isBookingActive(bookingInfo)).toBe(false);
    });

    test("returns false when booking has no start or end", () => {
      jest.setSystemTime(new Date("2025-06-15T12:00:00"));

      const bookingInfo = [
        { start: null, end: null, status: 1 },
        { start: 123456, end: null, status: 1 },
        { start: null, end: 123456, status: 1 },
      ];

      expect(isBookingActive(bookingInfo)).toBe(false);
    });
  });

  describe("Time boundaries", () => {
    test("returns true at exact start time", () => {
      jest.setSystemTime(new Date("2025-06-15T10:00:00"));

      const bookingStart = Math.floor(
        new Date("2025-06-15T10:00:00").getTime() / 1000
      );
      const bookingEnd = Math.floor(
        new Date("2025-06-15T12:00:00").getTime() / 1000
      );

      const bookingInfo = [
        {
          start: bookingStart,
          end: bookingEnd,
          status: 1,
        },
      ];

      expect(isBookingActive(bookingInfo)).toBe(true);
    });

    test("returns false at exact end time", () => {
      jest.setSystemTime(new Date("2025-06-15T12:00:00"));

      const bookingStart = Math.floor(
        new Date("2025-06-15T10:00:00").getTime() / 1000
      );
      const bookingEnd = Math.floor(
        new Date("2025-06-15T12:00:00").getTime() / 1000
      );

      const bookingInfo = [
        {
          start: bookingStart,
          end: bookingEnd,
          status: 1,
        },
      ];

      expect(isBookingActive(bookingInfo)).toBe(false);
    });
  });

  describe("Invalid input", () => {
    test("returns false for empty array", () => {
      expect(isBookingActive([])).toBe(false);
    });

    test("returns false for null", () => {
      expect(isBookingActive(null)).toBe(false);
    });

    test("returns false for undefined", () => {
      expect(isBookingActive(undefined)).toBe(false);
    });

    test("returns false for non-array input", () => {
      expect(isBookingActive("not an array")).toBe(false);
      expect(isBookingActive({})).toBe(false);
      expect(isBookingActive(123)).toBe(false);
    });
  });
});
