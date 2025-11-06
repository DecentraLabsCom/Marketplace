/**
 * Unit Tests for Safe Date Parsing Utilities
 *
 * Tests timezone-safe date parsing to avoid UTC conversion issues.
 * Critical for YYYY-MM-DD format dates that JavaScript interprets as UTC.
 *
 * Test Behaviors:
 * - Date object handling (valid/invalid)
 * - Timestamp parsing (includes falsy value edge case)
 * - YYYY-MM-DD format (local timezone, not UTC)
 * - Other string formats
 * - Null/undefined safety
 * - Calendar day comparison
 */

import { parseDateSafe, isSameCalendarDay } from "../parseDateSafe";

describe("parseDateSafe", () => {
  describe("Date object input", () => {
    test("returns valid Date object as-is", () => {
      const date = new Date("2025-01-15T10:00:00");

      const result = parseDateSafe(date);

      expect(result).toBe(date);
      expect(result).toBeInstanceOf(Date);
    });

    test("returns null for invalid Date object", () => {
      const invalidDate = new Date("invalid");

      const result = parseDateSafe(invalidDate);

      expect(result).toBeNull();
    });
  });

  describe("Timestamp (number) input", () => {
    test("converts valid timestamp to Date", () => {
      const timestamp = 1705320000000; // 2024-01-15 10:00:00 UTC

      const result = parseDateSafe(timestamp);

      expect(result).toBeInstanceOf(Date);
      expect(result.getTime()).toBe(timestamp);
    });

    test("returns null for invalid timestamp", () => {
      const result = parseDateSafe(NaN);

      expect(result).toBeNull();
    });

    test("returns null for zero timestamp (falsy value)", () => {
      // Zero is falsy, so code returns null at first check
      const result = parseDateSafe(0);

      expect(result).toBeNull();
    });

    test("handles negative timestamp", () => {
      const timestamp = -86400000; // One day before epoch

      const result = parseDateSafe(timestamp);

      expect(result).toBeInstanceOf(Date);
      expect(result.getTime()).toBe(timestamp);
    });
  });

  describe("YYYY-MM-DD format (local timezone)", () => {
    test("parses YYYY-MM-DD in local timezone", () => {
      const result = parseDateSafe("2025-01-15");

      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(0); // January (0-indexed)
      expect(result.getDate()).toBe(15);
    });

    test("parses single-digit month and day", () => {
      const result = parseDateSafe("2025-01-05");

      expect(result.getMonth()).toBe(0);
      expect(result.getDate()).toBe(5);
    });

    test("handles leap year dates", () => {
      const result = parseDateSafe("2024-02-29");

      expect(result).toBeInstanceOf(Date);
      expect(result.getMonth()).toBe(1); // February
      expect(result.getDate()).toBe(29);
    });

    test("handles year boundaries", () => {
      const jan1 = parseDateSafe("2025-01-01");
      const dec31 = parseDateSafe("2025-12-31");

      expect(jan1.getMonth()).toBe(0);
      expect(jan1.getDate()).toBe(1);
      expect(dec31.getMonth()).toBe(11);
      expect(dec31.getDate()).toBe(31);
    });

    test("handles JavaScript date overflow behavior", () => {
      // JavaScript overflows invalid dates instead of returning null
      const result1 = parseDateSafe("2025-13-01"); // Month 13 overflows to Jan 2026
      expect(result1).toBeInstanceOf(Date);
      expect(result1.getFullYear()).toBe(2026);
      expect(result1.getMonth()).toBe(0); // January

      const result2 = parseDateSafe("2025-02-30"); // Feb 30 overflows to March
      expect(result2).toBeInstanceOf(Date);
      expect(result2.getMonth()).toBe(2); // March

      const result3 = parseDateSafe("2023-02-29"); // Non-leap year overflows
      expect(result3).toBeInstanceOf(Date);
      expect(result3.getMonth()).toBe(2); // March
      expect(result3.getDate()).toBe(1);
    });
  });

  describe("Other string formats", () => {
    test("parses ISO datetime string", () => {
      const result = parseDateSafe("2025-01-15T10:00:00Z");

      expect(result).toBeInstanceOf(Date);
    });

    test("parses MM/DD/YYYY format", () => {
      const result = parseDateSafe("01/15/2025");

      expect(result).toBeInstanceOf(Date);
    });

    test("returns null for invalid string", () => {
      expect(parseDateSafe("invalid-date")).toBeNull();
      expect(parseDateSafe("not a date")).toBeNull();
    });

    test("handles empty string", () => {
      expect(parseDateSafe("")).toBeNull();
    });
  });

  describe("Null and undefined handling", () => {
    test("returns null for null input", () => {
      expect(parseDateSafe(null)).toBeNull();
    });

    test("returns null for undefined input", () => {
      expect(parseDateSafe(undefined)).toBeNull();
    });
  });

  describe("Edge cases", () => {
    test("returns null for unsupported types", () => {
      expect(parseDateSafe({})).toBeNull();
      expect(parseDateSafe([])).toBeNull();
      expect(parseDateSafe(true)).toBeNull();
    });

    test("handles whitespace in strings", () => {
      const result = parseDateSafe("  2025-01-15  ");

      // String with whitespace won't match YYYY-MM-DD regex, falls back to Date()
      expect(result).toBeInstanceOf(Date);
    });
  });
});

describe("isSameCalendarDay", () => {
  describe("Same calendar day", () => {
    test("returns true for identical dates", () => {
      const date1 = new Date("2025-01-15T10:00:00");
      const date2 = new Date("2025-01-15T10:00:00");

      expect(isSameCalendarDay(date1, date2)).toBe(true);
    });

    test("returns true for same day with different times", () => {
      const date1 = new Date("2025-01-15T08:00:00");
      const date2 = new Date("2025-01-15T20:00:00");

      expect(isSameCalendarDay(date1, date2)).toBe(true);
    });

    test("returns true for different input types (same day)", () => {
      const dateObj = new Date("2025-01-15");
      const dateStr = "2025-01-15";
      const timestamp = dateObj.getTime();

      expect(isSameCalendarDay(dateObj, dateStr)).toBe(true);
      expect(isSameCalendarDay(dateStr, timestamp)).toBe(true);
      expect(isSameCalendarDay(timestamp, dateObj)).toBe(true);
    });
  });

  describe("Different calendar days", () => {
    test("returns false for different days", () => {
      const date1 = new Date("2025-01-15");
      const date2 = new Date("2025-01-16");

      expect(isSameCalendarDay(date1, date2)).toBe(false);
    });

    test("returns false for dates one day apart", () => {
      const date1 = new Date("2025-01-15T23:59:59");
      const date2 = new Date("2025-01-16T00:00:00");

      expect(isSameCalendarDay(date1, date2)).toBe(false);
    });

    test("returns false for different months", () => {
      const date1 = new Date("2025-01-31");
      const date2 = new Date("2025-02-01");

      expect(isSameCalendarDay(date1, date2)).toBe(false);
    });

    test("returns false for different years", () => {
      const date1 = new Date("2024-12-31");
      const date2 = new Date("2025-01-01");

      expect(isSameCalendarDay(date1, date2)).toBe(false);
    });
  });

  describe("Invalid input handling", () => {
    test("returns false when first date is invalid", () => {
      expect(isSameCalendarDay(null, new Date("2025-01-15"))).toBe(false);
      expect(isSameCalendarDay("invalid", new Date("2025-01-15"))).toBe(false);
    });

    test("returns false when second date is invalid", () => {
      expect(isSameCalendarDay(new Date("2025-01-15"), null)).toBe(false);
      expect(isSameCalendarDay(new Date("2025-01-15"), "invalid")).toBe(false);
    });

    test("returns false when both dates are invalid", () => {
      expect(isSameCalendarDay(null, null)).toBe(false);
      expect(isSameCalendarDay("invalid", undefined)).toBe(false);
    });
  });

  describe("Edge cases", () => {
    test("returns false for epoch timestamp zero (falsy value)", () => {
      // parseDateSafe(0) returns null because 0 is falsy
      const epoch = new Date(0);
      const zeroTimestamp = 0;

      expect(isSameCalendarDay(epoch, zeroTimestamp)).toBe(false);
    });

    test("handles leap year dates", () => {
      const feb29 = new Date("2024-02-29");
      const sameFeb29 = "2024-02-29";

      expect(isSameCalendarDay(feb29, sameFeb29)).toBe(true);
    });

    test("compares dates in local timezone", () => {
      // Use local dates instead of UTC to ensure same calendar day
      const date1 = new Date("2025-01-15T00:00:00");
      const date2 = new Date("2025-01-15T23:59:59");

      expect(isSameCalendarDay(date1, date2)).toBe(true);
    });
  });
});
