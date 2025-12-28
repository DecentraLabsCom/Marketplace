/**
 * Unit Tests for useLabValidation Hook
 *
 * Tests the lab form validation hook that centralizes validation logic.
 * Validates both quick and full validation modes, field-specific validators,
 * and proper error handling for lab form data.
 *
 * Test Behaviors:
 *
 * - Validation Modes: Quick vs Full validation with correct function calls
 * - validateLab: Returns validation results and handles errors gracefully
 * - validateField: Validates individual fields correctly
 * - isValid/getErrors: Returns validation status and error objects
 * - validatePrice: Handles positive numbers, negatives, empty, and NaN values
 * - validateURI: Validates HTTP/HTTPS URLs and rejects invalid formats
 * - validateTime: Validates HH:MM format with edge cases
 * - Required Fields: Returns correct fields based on mode
 * - Edge Cases: Handles null/undefined data and passes refs correctly
 */

import { renderHook } from "@testing-library/react";
import { useLabValidation } from "../useLabValidation";
import { validateLabFull, validateLabQuick } from "@/utils/labValidation";
import devLog from "@/utils/dev/logger";

jest.mock("@/utils/labValidation");
jest.mock("@/utils/dev/logger");

describe("useLabValidation", () => {
  const mockLab = {
    name: "Test Lab",
    category: "Chemistry",
    description: "Test description",
    price: "100",
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations - simulate successful validation
    validateLabQuick.mockReturnValue({
      isValid: true,
      errors: {},
    });

    validateLabFull.mockReturnValue({
      isValid: true,
      errors: {},
    });
  });

  describe("Validation Modes", () => {
    test("uses correct validation function based on mode", () => {
      const { result: quickResult } = renderHook(() =>
        useLabValidation(mockLab, "quick")
      );
      quickResult.current.validateLab(mockLab, "quick");
      expect(validateLabQuick).toHaveBeenCalledWith(mockLab, {});
      expect(validateLabFull).not.toHaveBeenCalled();

      jest.clearAllMocks();

      const { result: fullResult } = renderHook(() =>
        useLabValidation(mockLab, "full")
      );
      fullResult.current.validateLab(mockLab, "full");
      expect(validateLabFull).toHaveBeenCalledWith(mockLab, {});
      expect(validateLabQuick).not.toHaveBeenCalled();
    });

    test("defaults to full validation when no mode specified", () => {
      const { result } = renderHook(() => useLabValidation(mockLab));

      result.current.validateLab(mockLab);

      expect(validateLabFull).toHaveBeenCalled();
    });
  });

  describe("validateLab", () => {
    test("returns validation result with isValid and errors", () => {
      validateLabFull.mockReturnValue({
        isValid: false,
        errors: { name: "Name is required" },
      });

      const { result } = renderHook(() => useLabValidation(mockLab));
      const validationResult = result.current.validateLab(mockLab);

      expect(validationResult).toEqual({
        isValid: false,
        errors: { name: "Name is required" },
      });
    });

    test("handles validation errors gracefully", () => {
      // Simulate validation function throwing an error
      validateLabFull.mockImplementation(() => {
        throw new Error("Validation crashed");
      });

      const { result } = renderHook(() => useLabValidation(mockLab));
      const validationResult = result.current.validateLab(mockLab);

      expect(validationResult.isValid).toBe(false);
      expect(validationResult.errors.general).toBe(
        "Validation failed. Please check your input."
      );
    });
  });

  describe("validateField", () => {
    test("validates single field and returns error if invalid", () => {
      validateLabFull.mockReturnValue({
        isValid: false,
        errors: { price: "Price must be positive" },
      });

      const { result } = renderHook(() => useLabValidation(mockLab));
      const error = result.current.validateField("price", "-10");

      expect(error).toBe("Price must be positive");
    });

    test("returns null when field is valid", () => {
      validateLabFull.mockReturnValue({
        isValid: true,
        errors: {},
      });

      const { result } = renderHook(() => useLabValidation(mockLab));
      const error = result.current.validateField("name", "Valid Name");

      expect(error).toBeNull();
    });
  });

  describe("isValid and getErrors", () => {
    test("returns correct validation status and errors", () => {
      validateLabFull.mockReturnValue({
        isValid: false,
        errors: { name: "Name is required", price: "Price must be positive" },
      });

      const { result } = renderHook(() => useLabValidation(mockLab));

      expect(result.current.isValid(mockLab)).toBe(false);
      expect(result.current.getErrors(mockLab)).toEqual({
        name: "Name is required",
        price: "Price must be positive",
      });
    });

    test("returns true and empty errors when validation passes", () => {
      validateLabFull.mockReturnValue({
        isValid: true,
        errors: {},
      });

      const { result } = renderHook(() => useLabValidation(mockLab));

      expect(result.current.isValid(mockLab)).toBe(true);
      expect(result.current.getErrors(mockLab)).toEqual({});
    });
  });

  describe("validatePrice", () => {
    test("validates positive numbers correctly", () => {
      const { result } = renderHook(() => useLabValidation(mockLab));

      expect(result.current.validatePrice("150.50")).toEqual({
        isValid: true,
        error: null,
        formattedPrice: "150.5",
      });

      expect(result.current.validatePrice("0")).toEqual({
        isValid: true,
        error: null,
        formattedPrice: "0",
      });
    });

    test("rejects negative numbers and NaN", () => {
      const { result } = renderHook(() => useLabValidation(mockLab));

      expect(result.current.validatePrice("-50").isValid).toBe(false);
      expect(result.current.validatePrice("not-a-number").isValid).toBe(false);
    });

    test("rejects empty or null price", () => {
      const { result } = renderHook(() => useLabValidation(mockLab));

      expect(result.current.validatePrice("").isValid).toBe(false);
      expect(result.current.validatePrice("").error).toBe("Price is required");
    });
  });

  describe("validateURI", () => {
    test("validates HTTP and HTTPS URLs correctly", () => {
      const { result } = renderHook(() => useLabValidation(mockLab));

      expect(result.current.validateURI("http://example.com").isValid).toBe(
        true
      );
      expect(
        result.current.validateURI("https://secure.example.com/path").isValid
      ).toBe(true);
    });

    test("rejects invalid URI formats", () => {
      const { result } = renderHook(() => useLabValidation(mockLab));

      expect(result.current.validateURI("not-a-valid-url").isValid).toBe(false);
      expect(result.current.validateURI("not-a-valid-url").error).toBe(
        "Invalid URI format"
      );
    });

    test("rejects empty or whitespace-only URIs", () => {
      const { result } = renderHook(() => useLabValidation(mockLab));

      expect(result.current.validateURI("").isValid).toBe(false);
      expect(result.current.validateURI("   ").isValid).toBe(false);
      expect(result.current.validateURI("").error).toBe("URI is required");
    });
  });

  describe("validateTime", () => {
    test("validates correct HH:MM formats including edge cases", () => {
      const { result } = renderHook(() => useLabValidation(mockLab));

      // Valid times
      expect(result.current.validateTime("14:30").isValid).toBe(true);
      expect(result.current.validateTime("00:00").isValid).toBe(true);
      expect(result.current.validateTime("23:59").isValid).toBe(true);
      expect(result.current.validateTime("9:30").isValid).toBe(true);
      expect(result.current.validateTime("09:30").isValid).toBe(true);
    });

    test("rejects invalid hour or minute values", () => {
      const { result } = renderHook(() => useLabValidation(mockLab));
      // Verify time boundaries are enforced (hours 0-23, minutes 0-59)
      expect(result.current.validateTime("24:00").isValid).toBe(false);
      expect(result.current.validateTime("14:60").isValid).toBe(false);
    });

    test("rejects wrong format", () => {
      const { result } = renderHook(() => useLabValidation(mockLab));

      expect(result.current.validateTime("14-30").isValid).toBe(false);
      expect(result.current.validateTime("14-30").error).toBe(
        "Time must be in HH:MM format"
      );
    });

    test("rejects empty time", () => {
      const { result } = renderHook(() => useLabValidation(mockLab));

      expect(result.current.validateTime("").isValid).toBe(false);
      expect(result.current.validateTime("").error).toBe("Time is required");
    });
  });

  describe("Required Fields", () => {
    test("returns quick mode required fields", () => {
      const { result } = renderHook(() => useLabValidation(mockLab, "quick"));

      expect(result.current.requiredFields).toEqual([
        "name",
        "category",
        "description",
        "price",
      ]);
    });

    test("returns full mode required fields", () => {
      const { result } = renderHook(() => useLabValidation(mockLab, "full"));

      expect(result.current.requiredFields).toEqual([
        "name",
        "category",
        "keywords",
        "description",
        "price",
        "accessURI",
        "accessKey",
        "timeSlots",
        "opens",
        "closes",
      ]);
    });
  });

  describe("Edge Cases", () => {
    test("handles null/undefined data gracefully", () => {
      const { result } = renderHook(() => useLabValidation(null));

      expect(result.current.validateLab(null)).toBeDefined();
      expect(result.current.validateLab(mockLab, undefined)).toBeDefined();
    });

    test("passes refs to validation functions", () => {
      const mockRefs = { nameRef: { current: null } };
      const { result } = renderHook(() =>
        useLabValidation(mockLab, "full", mockRefs)
      );

      result.current.validateLab(mockLab);

      expect(validateLabFull).toHaveBeenCalledWith(mockLab, mockRefs);
    });
  });
});
