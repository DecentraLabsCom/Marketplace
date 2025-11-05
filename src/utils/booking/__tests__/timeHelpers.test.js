/**
 * Unit Tests for Time Utilities
 *
 * Tests time/duration calculation utilities for booking system.
 * Focuses on edge cases, boundary conditions, and business logic.
 *
 * Test Behaviors:
 * - Duration calculations (positive, negative, edge cases)
 * - Duration formatting (plurals, zero values)
 * - Date manipulation (adding hours/minutes)
 * - Business hours validation
 * - Time rounding to intervals
 * - Time slot generation
 * - Overlap detection (critical for booking conflicts)
 */

import {
  calculateBookingDuration,
  formatDuration,
  addHours,
  addMinutes,
  isWithinBusinessHours,
  roundToInterval,
  getTimeSlots,
  timePeriodsOverlap,
} from "../timeHelpers";

describe("calculateBookingDuration", () => {
  test("calculates duration for 1 hour booking", () => {
    const start = new Date("2024-01-15T10:00:00");
    const end = new Date("2024-01-15T11:00:00");

    const result = calculateBookingDuration(start, end);

    expect(result.hours).toBe(1);
    expect(result.minutes).toBe(0);
    expect(result.totalMinutes).toBe(60);
    expect(result.totalMs).toBe(3600000);
  });

  test("calculates duration with minutes", () => {
    const start = new Date("2024-01-15T10:00:00");
    const end = new Date("2024-01-15T11:30:00");

    const result = calculateBookingDuration(start, end);

    expect(result.hours).toBe(1);
    expect(result.minutes).toBe(30);
    expect(result.totalMinutes).toBe(90);
  });

  test("handles multi-day bookings", () => {
    const start = new Date("2024-01-15T10:00:00");
    const end = new Date("2024-01-16T10:00:00");

    const result = calculateBookingDuration(start, end);

    expect(result.hours).toBe(24);
    expect(result.minutes).toBe(0);
  });

  test("handles zero duration", () => {
    const date = new Date("2024-01-15T10:00:00");

    const result = calculateBookingDuration(date, date);

    expect(result.hours).toBe(0);
    expect(result.minutes).toBe(0);
    expect(result.totalMinutes).toBe(0);
  });

  test("accepts string dates", () => {
    const result = calculateBookingDuration(
      "2024-01-15T10:00:00",
      "2024-01-15T12:00:00"
    );

    expect(result.hours).toBe(2);
  });
});

describe("formatDuration", () => {
  test.each([
    [0, 0, "0 minutes"],
    [1, 0, "1 hour"],
    [2, 0, "2 hours"],
    [0, 1, "1 minute"],
    [0, 30, "30 minutes"],
    [1, 30, "1 hour 30 minutes"],
    [2, 45, "2 hours 45 minutes"],
  ])(
    "formats %d hours and %d minutes correctly",
    (hours, minutes, expected) => {
      expect(formatDuration(hours, minutes)).toBe(expected);
    }
  );

  test("handles singular/plural correctly", () => {
    expect(formatDuration(1, 1)).toBe("1 hour 1 minute");
    expect(formatDuration(2, 2)).toBe("2 hours 2 minutes");
  });

  test("defaults minutes to 0 when not provided", () => {
    expect(formatDuration(3)).toBe("3 hours");
  });
});

describe("addHours", () => {
  test("adds positive hours", () => {
    const date = new Date("2024-01-15T10:00:00");

    const result = addHours(date, 2);

    expect(result.getHours()).toBe(12);
  });

  test("handles day rollover", () => {
    const date = new Date("2024-01-15T23:00:00");

    const result = addHours(date, 2);

    expect(result.getDate()).toBe(16);
    expect(result.getHours()).toBe(1);
  });

  test("does not mutate original date", () => {
    const date = new Date("2024-01-15T10:00:00");
    const originalHours = date.getHours();

    addHours(date, 2);

    expect(date.getHours()).toBe(originalHours);
  });

  test("handles negative hours", () => {
    const date = new Date("2024-01-15T10:00:00");

    const result = addHours(date, -2);

    expect(result.getHours()).toBe(8);
  });
});

describe("addMinutes", () => {
  test("adds positive minutes", () => {
    const date = new Date("2024-01-15T10:00:00");

    const result = addMinutes(date, 30);

    expect(result.getMinutes()).toBe(30);
  });

  test("handles hour rollover", () => {
    const date = new Date("2024-01-15T10:45:00");

    const result = addMinutes(date, 30);

    expect(result.getHours()).toBe(11);
    expect(result.getMinutes()).toBe(15);
  });

  test("does not mutate original date", () => {
    const date = new Date("2024-01-15T10:00:00");
    const originalMinutes = date.getMinutes();

    addMinutes(date, 30);

    expect(date.getMinutes()).toBe(originalMinutes);
  });
});

describe("isWithinBusinessHours", () => {
  test("returns true when time is within business hours", () => {
    const date = new Date("2024-01-15T12:00:00"); // noon

    expect(isWithinBusinessHours(date, "09:00", "17:00")).toBe(true);
  });

  test("returns false when before opening", () => {
    const date = new Date("2024-01-15T08:00:00");

    expect(isWithinBusinessHours(date, "09:00", "17:00")).toBe(false);
  });

  test("returns false when after closing", () => {
    const date = new Date("2024-01-15T18:00:00");

    expect(isWithinBusinessHours(date, "09:00", "17:00")).toBe(false);
  });

  test("returns true at exact opening time", () => {
    const date = new Date("2024-01-15T09:00:00");

    expect(isWithinBusinessHours(date, "09:00", "17:00")).toBe(true);
  });

  test("returns true at exact closing time", () => {
    const date = new Date("2024-01-15T17:00:00");

    expect(isWithinBusinessHours(date, "09:00", "17:00")).toBe(true);
  });

  test("handles times with minutes", () => {
    const date = new Date("2024-01-15T09:30:00");

    expect(isWithinBusinessHours(date, "09:30", "17:30")).toBe(true);
  });
});

describe("roundToInterval", () => {
  test("rounds down to 30-minute interval", () => {
    const date = new Date("2024-01-15T10:10:00");

    const result = roundToInterval(date, 30);

    expect(result.getMinutes()).toBe(0);
  });

  test("rounds up to 30-minute interval", () => {
    const date = new Date("2024-01-15T10:20:00");

    const result = roundToInterval(date, 30);

    expect(result.getMinutes()).toBe(30);
  });

  test("defaults to 30-minute interval", () => {
    const date = new Date("2024-01-15T10:45:00");

    const result = roundToInterval(date);

    expect(result.getHours()).toBe(11);
    expect(result.getMinutes()).toBe(0);
  });

  test("rounds to 15-minute interval", () => {
    const date = new Date("2024-01-15T10:20:00");

    const result = roundToInterval(date, 15);

    expect(result.getMinutes()).toBe(15);
  });

  test("clears seconds and milliseconds", () => {
    const date = new Date("2024-01-15T10:00:30.500");

    const result = roundToInterval(date, 30);

    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });

  test("does not mutate original date", () => {
    const date = new Date("2024-01-15T10:20:00");
    const originalMinutes = date.getMinutes();

    roundToInterval(date, 30);

    expect(date.getMinutes()).toBe(originalMinutes);
  });
});

describe("getTimeSlots", () => {
  test("generates hourly slots for full day", () => {
    const date = new Date("2024-01-15");

    const slots = getTimeSlots(date, "09:00", "17:00", 60);

    expect(slots).toHaveLength(8); // 9am-5pm = 8 hours
    expect(slots[0].start.getHours()).toBe(9);
    expect(slots[7].end.getHours()).toBe(17);
  });

  test("generates 30-minute slots", () => {
    const date = new Date("2024-01-15");

    const slots = getTimeSlots(date, "09:00", "11:00", 30);

    expect(slots).toHaveLength(4); // 2 hours = 4 slots of 30min
  });

  test("each slot has correct properties", () => {
    const date = new Date("2024-01-15");

    const slots = getTimeSlots(date, "09:00", "10:00", 30);

    expect(slots[0]).toHaveProperty("start");
    expect(slots[0]).toHaveProperty("end");
    expect(slots[0]).toHaveProperty("duration");
    expect(slots[0].duration).toBe(30);
  });

  test("handles non-hour-aligned times", () => {
    const date = new Date("2024-01-15");

    const slots = getTimeSlots(date, "09:30", "11:30", 60);

    expect(slots).toHaveLength(2);
    expect(slots[0].start.getMinutes()).toBe(30);
  });

  test("excludes partial slots at end", () => {
    const date = new Date("2024-01-15");

    const slots = getTimeSlots(date, "09:00", "10:45", 60);

    expect(slots).toHaveLength(1); // Only one full hour fits
  });

  test("returns empty array when no slots fit", () => {
    const date = new Date("2024-01-15");

    const slots = getTimeSlots(date, "09:00", "09:30", 60);

    expect(slots).toHaveLength(0);
  });
});

describe("timePeriodsOverlap", () => {
  test("detects overlap when periods intersect", () => {
    const start1 = new Date("2024-01-15T10:00:00");
    const end1 = new Date("2024-01-15T12:00:00");
    const start2 = new Date("2024-01-15T11:00:00");
    const end2 = new Date("2024-01-15T13:00:00");

    expect(timePeriodsOverlap(start1, end1, start2, end2)).toBe(true);
  });

  test("detects no overlap when periods are separate", () => {
    const start1 = new Date("2024-01-15T10:00:00");
    const end1 = new Date("2024-01-15T12:00:00");
    const start2 = new Date("2024-01-15T13:00:00");
    const end2 = new Date("2024-01-15T15:00:00");

    expect(timePeriodsOverlap(start1, end1, start2, end2)).toBe(false);
  });

  test("detects overlap when one period contains another", () => {
    const start1 = new Date("2024-01-15T09:00:00");
    const end1 = new Date("2024-01-15T17:00:00");
    const start2 = new Date("2024-01-15T10:00:00");
    const end2 = new Date("2024-01-15T12:00:00");

    expect(timePeriodsOverlap(start1, end1, start2, end2)).toBe(true);
  });

  test("detects no overlap when periods touch at boundary", () => {
    const start1 = new Date("2024-01-15T10:00:00");
    const end1 = new Date("2024-01-15T12:00:00");
    const start2 = new Date("2024-01-15T12:00:00");
    const end2 = new Date("2024-01-15T14:00:00");

    expect(timePeriodsOverlap(start1, end1, start2, end2)).toBe(false);
  });

  test("is commutative (order does not matter)", () => {
    const start1 = new Date("2024-01-15T10:00:00");
    const end1 = new Date("2024-01-15T12:00:00");
    const start2 = new Date("2024-01-15T11:00:00");
    const end2 = new Date("2024-01-15T13:00:00");

    expect(timePeriodsOverlap(start1, end1, start2, end2)).toBe(
      timePeriodsOverlap(start2, end2, start1, end1)
    );
  });
});
