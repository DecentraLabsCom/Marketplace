/**
 * Unit Tests for Price Formatting Utilities
 *
 * Tests price formatting and calculation utilities for lab marketplace.
 * Focuses on edge cases, invalid input handling, and formatting consistency.
 *
 * Test Behaviors:
 * - Price formatting with decimals
 * - Price range formatting
 * - String to number parsing
 * - Total price calculation
 * - Currency formatting with thousand separators
 */

import {
  formatPrice,
  formatPriceRange,
  parsePrice,
  calculateTotalPrice,
  formatCurrency,
} from "../priceHelpers";

describe("formatPrice", () => {
  test("formats valid price with default 2 decimals", () => {
    expect(formatPrice(10)).toBe("10.00");
    expect(formatPrice(10.5)).toBe("10.50");
    expect(formatPrice(10.99)).toBe("10.99");
  });

  test("formats price with custom decimals", () => {
    expect(formatPrice(10.123, 0)).toBe("10");
    expect(formatPrice(10.123, 1)).toBe("10.1");
    expect(formatPrice(10.123, 3)).toBe("10.123");
  });

  test("rounds to specified decimal places", () => {
    expect(formatPrice(10.126, 2)).toBe("10.13");
    expect(formatPrice(10.124, 2)).toBe("10.12");
    expect(formatPrice(10.995, 2)).toBe("10.99");
  });

  test("handles zero", () => {
    expect(formatPrice(0)).toBe("0.00");
    expect(formatPrice(0, 3)).toBe("0.000");
  });

  test("handles negative numbers", () => {
    expect(formatPrice(-10.5)).toBe("-10.50");
    expect(formatPrice(-100)).toBe("-100.00");
  });

  test('returns "0.00" for NaN', () => {
    expect(formatPrice(NaN)).toBe("0.00");
  });

  test('returns "0.00" for non-number types', () => {
    expect(formatPrice("string")).toBe("0.00");
    expect(formatPrice(null)).toBe("0.00");
    expect(formatPrice(undefined)).toBe("0.00");
    expect(formatPrice({})).toBe("0.00");
  });

  test("handles very large numbers", () => {
    expect(formatPrice(999999.99)).toBe("999999.99");
  });

  test("handles very small numbers", () => {
    expect(formatPrice(0.01)).toBe("0.01");
    expect(formatPrice(0.001, 3)).toBe("0.001");
  });
});

describe("formatPriceRange", () => {
  test("formats single price when min equals max", () => {
    expect(formatPriceRange(10, 10)).toBe("10.00 LAB");
    expect(formatPriceRange(50.5, 50.5)).toBe("50.50 LAB");
  });

  test("formats price range when min differs from max", () => {
    expect(formatPriceRange(10, 20)).toBe("10.00 - 20.00 LAB");
    expect(formatPriceRange(5.5, 15.75)).toBe("5.50 - 15.75 LAB");
  });

  test("formats range with custom decimals", () => {
    expect(formatPriceRange(10, 20, 0)).toBe("10 - 20 LAB");
    expect(formatPriceRange(10.123, 20.456, 3)).toBe("10.123 - 20.456 LAB");
  });

  test("handles zero prices", () => {
    expect(formatPriceRange(0, 0)).toBe("0.00 LAB");
    expect(formatPriceRange(0, 10)).toBe("0.00 - 10.00 LAB");
  });

  test("handles invalid input gracefully", () => {
    expect(formatPriceRange(NaN, 10)).toBe("0.00 - 10.00 LAB");
    expect(formatPriceRange(10, NaN)).toBe("10.00 - 0.00 LAB");
    expect(formatPriceRange(NaN, NaN)).toBe("0.00 - 0.00 LAB");
  });
});

describe("parsePrice", () => {
  test("parses valid price strings", () => {
    expect(parsePrice("10")).toBe(10);
    expect(parsePrice("10.50")).toBe(10.5);
    expect(parsePrice("0.99")).toBe(0.99);
  });

  test("parses strings with leading/trailing spaces", () => {
    expect(parsePrice("  10.50  ")).toBe(10.5);
  });

  test("parses negative numbers", () => {
    expect(parsePrice("-10.50")).toBe(-10.5);
  });

  test("returns 0 for invalid strings", () => {
    expect(parsePrice("invalid")).toBe(0);
    expect(parsePrice("abc123")).toBe(0);
    expect(parsePrice("")).toBe(0);
  });

  test("returns 0 for non-string types", () => {
    expect(parsePrice(null)).toBe(0);
    expect(parsePrice(undefined)).toBe(0);
    expect(parsePrice({})).toBe(0);
  });

  test("handles scientific notation", () => {
    expect(parsePrice("1e2")).toBe(100);
    expect(parsePrice("1.5e1")).toBe(15);
  });

  test("parses partial numbers in strings", () => {
    // parseFloat behavior: extracts leading number
    expect(parsePrice("10abc")).toBe(10);
    expect(parsePrice("10.5 LAB")).toBe(10.5);
  });

  test("handles zero", () => {
    expect(parsePrice("0")).toBe(0);
    expect(parsePrice("0.00")).toBe(0);
  });
});

describe("calculateTotalPrice", () => {
  test("calculates total for whole hours", () => {
    expect(calculateTotalPrice(10, 2)).toBe(20);
    expect(calculateTotalPrice(50, 3)).toBe(150);
  });

  test("calculates total for fractional hours", () => {
    expect(calculateTotalPrice(10, 1.5)).toBe(15);
    expect(calculateTotalPrice(20, 0.5)).toBe(10);
  });

  test("handles zero hours", () => {
    expect(calculateTotalPrice(10, 0)).toBe(0);
  });

  test("handles zero hourly rate", () => {
    expect(calculateTotalPrice(0, 10)).toBe(0);
  });

  test("handles negative values", () => {
    expect(calculateTotalPrice(-10, 2)).toBe(-20);
    expect(calculateTotalPrice(10, -2)).toBe(-20);
  });

  test("handles decimal precision", () => {
    const result = calculateTotalPrice(10.5, 2.5);
    expect(result).toBeCloseTo(26.25, 2);
  });

  test("handles very small fractions", () => {
    expect(calculateTotalPrice(100, 0.1)).toBe(10);
    expect(calculateTotalPrice(50, 0.25)).toBe(12.5);
  });
});

describe("formatCurrency", () => {
  test("formats amount with thousand separators", () => {
    expect(formatCurrency(1000)).toBe("1,000.00 LAB");
    expect(formatCurrency(10000)).toBe("10,000.00 LAB");
    expect(formatCurrency(1000000)).toBe("1,000,000.00 LAB");
  });

  test("formats decimals correctly", () => {
    expect(formatCurrency(10.5)).toBe("10.50 LAB");
    expect(formatCurrency(99.99)).toBe("99.99 LAB");
  });

  test("pads decimals to 2 places", () => {
    expect(formatCurrency(10)).toBe("10.00 LAB");
    expect(formatCurrency(10.5)).toBe("10.50 LAB");
  });

  test("rounds to 2 decimal places", () => {
    expect(formatCurrency(10.126)).toBe("10.13 LAB");
    expect(formatCurrency(10.124)).toBe("10.12 LAB");
  });

  test("uses custom currency symbol", () => {
    expect(formatCurrency(100, "USD")).toBe("100.00 USD");
    expect(formatCurrency(100, "ETH")).toBe("100.00 ETH");
    expect(formatCurrency(100, "€")).toBe("100.00 €");
  });

  test("handles zero", () => {
    expect(formatCurrency(0)).toBe("0.00 LAB");
  });

  test("handles negative amounts", () => {
    expect(formatCurrency(-100.5)).toBe("-100.50 LAB");
    expect(formatCurrency(-1000)).toBe("-1,000.00 LAB");
  });

  test("handles very large numbers", () => {
    expect(formatCurrency(1234567.89)).toBe("1,234,567.89 LAB");
  });

  test("handles very small positive numbers", () => {
    expect(formatCurrency(0.01)).toBe("0.01 LAB");
    expect(formatCurrency(0.99)).toBe("0.99 LAB");
  });
});
