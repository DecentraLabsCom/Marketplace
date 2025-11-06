/**
 * Unit Tests for Date Formatter Utilities
 *
 * Tests date format conversion for lab metadata.
 * Handles multiple input formats and edge cases.
 *
 * Tests Behaviors:
 * - MM/DD/YYYY format validation and padding
 * - DD/MM/YYYY detection and conversion (when first number > 12)
 * - YYYY-MM-DD (ISO) format conversion
 * - Alternative separators (-, .)
 * - Ambiguous date handling (assumes MM/DD/YYYY)
 * - Invalid input handling
 * - Lab data normalization
 */

import { convertToMMDDYYYY, normalizeLabDates } from "../dateFormatter";

describe("convertToMMDDYYYY", () => {
  describe("Already correct MM/DD/YYYY format", () => {
    test.each([
      ["01/15/2025", "01/15/2025"],
      ["12/31/2024", "12/31/2024"],
      ["03/05/2025", "03/05/2025"],
      ["1/5/2025", "01/05/2025"], // Pads single digits
      ["12/1/2025", "12/01/2025"], // Pads single day
      ["1/15/2025", "01/15/2025"], // Pads single month
    ])("converts %s to %s", (input, expected) => {
      expect(convertToMMDDYYYY(input)).toBe(expected);
    });
  });

  describe("DD/MM/YYYY detection (when day > 12)", () => {
    test.each([
      ["31/12/2024", "12/31/2024"], // December 31
      ["25/03/2025", "03/25/2025"], // March 25
      ["15/01/2025", "01/15/2025"], // January 15
      ["20/06/2025", "06/20/2025"], // June 20
    ])("swaps %s to MM/DD/YYYY format", (input, expected) => {
      expect(convertToMMDDYYYY(input)).toBe(expected);
    });

    test("does not swap when both parts are <= 12 (ambiguous)", () => {
      // 02/03/2025 could be Feb 3 or Mar 2, assumes MM/DD/YYYY
      expect(convertToMMDDYYYY("02/03/2025")).toBe("02/03/2025");
      expect(convertToMMDDYYYY("10/11/2025")).toBe("10/11/2025");
    });
  });

  describe("ISO format (YYYY-MM-DD)", () => {
    test.each([
      ["2025-01-15", "01/15/2025"],
      ["2024-12-31", "12/31/2024"],
      ["2025-3-5", "03/05/2025"], // Single digit month/day
      ["2025-12-1", "12/01/2025"],
    ])("converts %s to MM/DD/YYYY", (input, expected) => {
      expect(convertToMMDDYYYY(input)).toBe(expected);
    });
  });

  describe("Alternative separators (-, .)", () => {
    test.each([
      ["01-15-2025", "01/15/2025"], // Dash separator
      ["01.15.2025", "01/15/2025"], // Dot separator
      ["3-5-2025", "03/05/2025"], // Single digits with dash
      ["12.31.2024", "12/31/2024"],
    ])("converts %s with alternative separator", (input, expected) => {
      expect(convertToMMDDYYYY(input)).toBe(expected);
    });

    test("swaps DD-MM-YYYY to MM/DD/YYYY when day > 12", () => {
      expect(convertToMMDDYYYY("25-03-2025")).toBe("03/25/2025");
      expect(convertToMMDDYYYY("31.12.2024")).toBe("12/31/2024");
    });
  });

  describe("Fallback to Date object parsing", () => {
    test("parses valid date strings using Date constructor", () => {
      // Date constructor creates valid dates
      const result = convertToMMDDYYYY("March 15, 2025");
      expect(result).toMatch(/\d{2}\/\d{2}\/2025/);
    });

    test("parses ISO datetime strings", () => {
      const result = convertToMMDDYYYY("2025-01-15T10:00:00Z");
      expect(result).toBe("01/15/2025");
    });
  });

  describe("Invalid input handling", () => {
    test.each([
      [null, null],
      [undefined, undefined],
      ["", ""],
      ["   ", "   "],
    ])("returns %s for invalid input", (input, expected) => {
      expect(convertToMMDDYYYY(input)).toBe(expected);
    });

    test("returns original string for unparseable dates", () => {
      expect(convertToMMDDYYYY("invalid-date")).toBe("invalid-date");
      expect(convertToMMDDYYYY("not/a/date")).toBe("not/a/date");
      expect(convertToMMDDYYYY("13/32/2025")).toBe("13/32/2025"); // Invalid month/day
    });

    test("returns original for non-string input", () => {
      expect(convertToMMDDYYYY(123)).toBe(123);
      expect(convertToMMDDYYYY({})).toEqual({});
      expect(convertToMMDDYYYY([])).toEqual([]);
    });
  });

  describe("Edge cases", () => {
    test("handles leap year dates", () => {
      expect(convertToMMDDYYYY("02/29/2024")).toBe("02/29/2024"); // Valid leap year
      expect(convertToMMDDYYYY("29/02/2024")).toBe("02/29/2024"); // DD/MM format
    });

    test("handles year boundaries", () => {
      expect(convertToMMDDYYYY("01/01/2025")).toBe("01/01/2025");
      expect(convertToMMDDYYYY("12/31/2024")).toBe("12/31/2024");
    });

    test("trims whitespace before processing", () => {
      expect(convertToMMDDYYYY("  01/15/2025  ")).toBe("01/15/2025");
      expect(convertToMMDDYYYY(" 2025-01-15 ")).toBe("01/15/2025");
    });

    test("handles maximum valid dates", () => {
      expect(convertToMMDDYYYY("12/31/9999")).toBe("12/31/9999");
    });
  });
});

describe("normalizeLabDates", () => {
  test("converts both opens and closes dates", () => {
    const labData = {
      name: "Test Lab",
      opens: "2025-01-15",
      closes: "31/12/2025",
    };

    const result = normalizeLabDates(labData);

    expect(result.opens).toBe("01/15/2025");
    expect(result.closes).toBe("12/31/2025");
  });

  test("preserves other lab properties", () => {
    const labData = {
      name: "Test Lab",
      opens: "01/15/2025",
      closes: "12/31/2025",
      capacity: 10,
      description: "A test lab",
    };

    const result = normalizeLabDates(labData);

    expect(result.name).toBe("Test Lab");
    expect(result.capacity).toBe(10);
    expect(result.description).toBe("A test lab");
  });

  test("handles missing date fields", () => {
    const labData = {
      name: "Test Lab",
      capacity: 10,
    };

    const result = normalizeLabDates(labData);

    expect(result).toEqual(labData);
  });

  test("handles only opens date", () => {
    const labData = {
      name: "Test Lab",
      opens: "2025-01-15",
    };

    const result = normalizeLabDates(labData);

    expect(result.opens).toBe("01/15/2025");
    expect(result.closes).toBeUndefined();
  });

  test("handles only closes date", () => {
    const labData = {
      name: "Test Lab",
      closes: "31/12/2025",
    };

    const result = normalizeLabDates(labData);

    expect(result.opens).toBeUndefined();
    expect(result.closes).toBe("12/31/2025");
  });

  test("does not mutate original object", () => {
    const labData = {
      name: "Test Lab",
      opens: "2025-01-15",
      closes: "2025-12-31",
    };

    const result = normalizeLabDates(labData);

    expect(result).not.toBe(labData); // Different object reference
    expect(labData.opens).toBe("2025-01-15"); // Original unchanged
  });

  test("returns input for null/undefined", () => {
    expect(normalizeLabDates(null)).toBeNull();
    expect(normalizeLabDates(undefined)).toBeUndefined();
  });

  test("returns input for non-object types", () => {
    expect(normalizeLabDates("string")).toBe("string");
    expect(normalizeLabDates(123)).toBe(123);
    expect(normalizeLabDates([])).toEqual({});
  });

  test("handles invalid date values gracefully", () => {
    const labData = {
      name: "Test Lab",
      opens: "invalid-date",
      closes: null,
    };

    const result = normalizeLabDates(labData);

    expect(result.opens).toBe("invalid-date"); // Returns original
    expect(result.closes).toBeNull();
  });
});
