/**
 * Unit Tests for Date Validation Utilities
 *
 * Tests core date validation logic including leap years, month-day limits,
 * format patterns, date ranges, and business rules.
 *
 * Test Behaviors:
 * - Leap year algorithm edge cases
 * - Month-specific day validation
 * - Regex format pattern matching
 * - Business rule compliance
 * - Chronological range validation
 */

import {
  isLeapYear,
  getDaysInMonth,
  validateDateString,
  validateDateRange,
} from "../dateValidation";

describe("isLeapYear", () => {
  test.each([
    // Standard leap years (divisible by 4, not by 100)
    [2020, true],
    [2024, true],
    [2028, true],
    // Century years (must be divisible by 400)
    [2000, true], // divisible by 400
    [1900, false], // divisible by 100 but not 400
    [2100, false], // divisible by 100 but not 400
    [2400, true], // divisible by 400
    // Non-leap years
    [2021, false],
    [2022, false],
    [2023, false],
  ])("returns %s for year %d", (year, expected) => {
    expect(isLeapYear(year)).toBe(expected);
  });
});

describe("getDaysInMonth", () => {
  describe("Standard months", () => {
    test.each([
      [1, 2024, 31], // January
      [3, 2024, 31], // March
      [4, 2024, 30], // April
      [5, 2024, 31], // May
      [6, 2024, 30], // June
      [7, 2024, 31], // July
      [8, 2024, 31], // August
      [9, 2024, 30], // September
      [10, 2024, 31], // October
      [11, 2024, 30], // November
      [12, 2024, 31], // December
    ])("returns %d days for month %d", (month, year, expected) => {
      expect(getDaysInMonth(month, year)).toBe(expected);
    });
  });

  describe("February in leap vs non-leap years", () => {
    test("returns 29 days for February in leap year", () => {
      expect(getDaysInMonth(2, 2024)).toBe(29);
      expect(getDaysInMonth(2, 2000)).toBe(29);
    });

    test("returns 28 days for February in non-leap year", () => {
      expect(getDaysInMonth(2, 2023)).toBe(28);
      expect(getDaysInMonth(2, 1900)).toBe(28);
    });
  });

  test("returns 31 for invalid month (fallback)", () => {
    expect(getDaysInMonth(13, 2024)).toBe(31);
    expect(getDaysInMonth(0, 2024)).toBe(31);
  });
});

describe("validateDateString", () => {
  const currentYear = new Date().getFullYear();
  const findLeapYearInRange = (startYear, endYear) => {
    for (let year = startYear; year <= endYear; year += 1) {
      if (isLeapYear(year)) {
        return year;
      }
    }
    return null;
  };

  describe("Required field validation", () => {
    test.each([
      [null, "Date is required"],
      [undefined, "Date is required"],
      ["", "Date is required"],
      ["   ", "Date is required"],
    ])("rejects %s", (input, expectedError) => {
      const result = validateDateString(input);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe(expectedError);
    });

    test("rejects non-string input", () => {
      const result = validateDateString(12345);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Date is required");
    });
  });

  describe("Format validation", () => {
    test("accepts valid MM/DD/YYYY format", () => {
      const result = validateDateString(`03/15/${currentYear}`);

      expect(result.isValid).toBe(true);
      expect(result.parsedDate).toEqual({
        month: 3,
        day: 15,
        year: currentYear,
      });
    });

    test.each([
      "3/15/2025", // Missing leading zero
      "03-15-2025", // Wrong separator
      "15/03/2025", // DD/MM/YYYY
      "2025/03/15", // YYYY/MM/DD
      "03/15/25", // Two-digit year
      "13/15/2025", // Invalid month
      "03/32/2025", // Invalid day
      "invalid", // Random string
    ])("rejects invalid format: %s", (input) => {
      const result = validateDateString(input);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("Invalid date format");
    });
  });

  describe("Days per month validation", () => {
    test("rejects February 30", () => {
      const result = validateDateString(`02/30/${currentYear}`);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("February");
      expect(result.error).toContain("only has");
    });

    test("rejects February 29 in non-leap year", () => {
      const result = validateDateString("02/29/2023");

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("February 2023 only has 28 days");
    });

    test("accepts February 29 in leap year", () => {
      const leapYear = findLeapYearInRange(currentYear - 1, currentYear + 10);

      expect(leapYear).not.toBeNull();
      const result = validateDateString(`02/29/${leapYear}`);

      expect(result.isValid).toBe(true);
    });

    test("rejects April 31", () => {
      const result = validateDateString(`04/31/${currentYear}`);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("April");
      expect(result.error).toContain("only has 30 days");
    });

    test("accepts valid day 31 for months with 31 days", () => {
      const result = validateDateString(`01/31/${currentYear}`);

      expect(result.isValid).toBe(true);
    });
  });

  describe("Year range validation", () => {
    test("accepts current year", () => {
      const result = validateDateString(`06/15/${currentYear}`);

      expect(result.isValid).toBe(true);
    });

    test("accepts previous year", () => {
      const result = validateDateString(`06/15/${currentYear - 1}`);

      expect(result.isValid).toBe(true);
    });

    test("accepts 10 years in the future", () => {
      const result = validateDateString(`06/15/${currentYear + 10}`);

      expect(result.isValid).toBe(true);
    });

    test("rejects year too far in past", () => {
      const result = validateDateString(`06/15/${currentYear - 2}`);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("Year must be between");
    });

    test("rejects year too far in future", () => {
      const result = validateDateString(`06/15/${currentYear + 11}`);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("Year must be between");
    });
  });

  describe("Edge cases", () => {
    test("trims whitespace from input", () => {
      const result = validateDateString(`  03/15/${currentYear}  `);

      expect(result.isValid).toBe(true);
    });

    test("validates December 31 correctly", () => {
      const result = validateDateString(`12/31/${currentYear}`);

      expect(result.isValid).toBe(true);
    });

    test("validates January 01 correctly", () => {
      const result = validateDateString(`01/01/${currentYear}`);

      expect(result.isValid).toBe(true);
    });
  });
});

describe("validateDateRange", () => {
  const currentYear = new Date().getFullYear();

  test("accepts when closing date is after opening date", () => {
    const result = validateDateRange(
      `01/01/${currentYear}`,
      `12/31/${currentYear}`
    );

    expect(result.isValid).toBe(true);
    expect(result.error).toBeNull();
  });

  test("accepts when closing date equals opening date", () => {
    const result = validateDateRange(
      `06/15/${currentYear}`,
      `06/15/${currentYear}`
    );

    expect(result.isValid).toBe(true);
  });

  test("rejects when closing date is before opening date", () => {
    const result = validateDateRange(
      `12/31/${currentYear}`,
      `01/01/${currentYear}`
    );

    expect(result.isValid).toBe(false);
    expect(result.error).toBe(
      "Closing date must be after or equal to opening date"
    );
  });

  test("skips range validation when opening date is invalid", () => {
    const result = validateDateRange("invalid", `12/31/${currentYear}`);

    expect(result.isValid).toBe(true); // Defers to individual validation
  });

  test("skips range validation when closing date is invalid", () => {
    const result = validateDateRange(`01/01/${currentYear}`, "invalid");

    expect(result.isValid).toBe(true); // Defers to individual validation
  });

  test("handles dates with different months", () => {
    const result = validateDateRange(
      `03/15/${currentYear}`,
      `04/20/${currentYear}`
    );

    expect(result.isValid).toBe(true);
  });

  test("handles dates spanning year boundary", () => {
    const result = validateDateRange(
      `12/01/${currentYear}`,
      `01/31/${currentYear + 1}`
    );

    expect(result.isValid).toBe(true);
  });

  test("rejects dates one day apart in wrong order", () => {
    const result = validateDateRange(
      `03/16/${currentYear}`,
      `03/15/${currentYear}`
    );

    expect(result.isValid).toBe(false);
  });
});
