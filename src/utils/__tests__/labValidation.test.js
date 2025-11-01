/**
 * Unit Tests for Lab Validation Functions
 *
 * Tests core validation logic for lab forms (full and quick modes).
 * Focuses on edge cases and critical business rules.
 *
 * Test Behaviors:
 * - Required field validation
 * - Price edge cases (negative, zero, NaN, empty)
 * - URL format validation
 * - Date validation integration
 * - Collection validations (timeSlots, keywords)
 * - Media link format validation
 */

import { validateLabFull, validateLabQuick } from "../labValidation";
import { validateDateString, validateDateRange } from "../dates/dateValidation";

jest.mock("../dates/dateValidation", () => ({
  validateDateString: jest.fn(),
  validateDateRange: jest.fn(),
}));

describe("validateLabFull", () => {
  const validLab = {
    name: "AI Lab",
    category: "AI",
    description: "Test lab",
    price: 100,
    auth: "https://auth.example.com",
    accessURI: "https://lab.example.com",
    accessKey: "key123",
    opens: "01/01/2024",
    closes: "12/31/2024",
    timeSlots: [60],
    keywords: ["ai"],
    images: [],
    docs: [],
  };

  const validOptions = { imageInputType: "file", docInputType: "file" };

  beforeEach(() => {
    jest.clearAllMocks();
    validateDateString.mockReturnValue({ isValid: true });
    validateDateRange.mockReturnValue({ isValid: true });
  });

  describe("Required Fields", () => {
    test.each([
      ["name", "", "Lab name is required"],
      ["category", "", "Category is required"],
      ["description", "", "Description is required"],
      ["accessKey", "", "Access Key is required"],
      ["name", "   ", "Lab name is required"], // whitespace edge case
    ])("validates %s is required", (field, value, expectedError) => {
      const lab = { ...validLab, [field]: value };

      const errors = validateLabFull(lab, validOptions);

      expect(errors[field]).toBe(expectedError);
    });

    test("returns no errors when all fields valid", () => {
      const errors = validateLabFull(validLab, validOptions);

      expect(Object.keys(errors)).toHaveLength(0);
    });
  });

  describe("Price Validation", () => {
    test.each([
      [0, undefined], // zero is valid
      [100, undefined], // positive is valid
      ["", "Price is required"],
      [undefined, "Price is required"],
      [null, "Price is required"],
      [-50, "Price must be a positive number or zero"],
      ["not-number", "Price must be a positive number or zero"],
    ])("handles price=%s correctly", (price, expectedError) => {
      const lab = { ...validLab, price };

      const errors = validateLabFull(lab, validOptions);

      if (expectedError) {
        expect(errors.price).toBe(expectedError);
      } else {
        expect(errors.price).toBeUndefined();
      }
    });
  });

  describe("URL Validation", () => {
    test.each([
      ["auth", "", "Authentication URL is required"],
      ["auth", "not-url", "Invalid Authentication URL format"],
      ["accessURI", "", "Access URI is required"],
      ["accessURI", "invalid", "Invalid Access URI format"],
    ])("validates %s URL format", (field, value, expectedError) => {
      const lab = { ...validLab, [field]: value };

      const errors = validateLabFull(lab, validOptions);

      expect(errors[field]).toBe(expectedError);
    });

    test.each([
      ["https://example.com"],
      ["http://example.com"],
      ["ftp://files.example.com"],
    ])("accepts valid URL protocol: %s", (url) => {
      const lab = { ...validLab, auth: url, accessURI: url };

      const errors = validateLabFull(lab, validOptions);

      expect(errors.auth).toBeUndefined();
      expect(errors.accessURI).toBeUndefined();
    });
  });

  describe("Date Validation", () => {
    test("validates dates using external utility", () => {
      validateLabFull(validLab, validOptions);

      expect(validateDateString).toHaveBeenCalledWith("01/01/2024");
      expect(validateDateString).toHaveBeenCalledWith("12/31/2024");
      expect(validateDateRange).toHaveBeenCalledWith(
        "01/01/2024",
        "12/31/2024"
      );
    });

    test("returns error when opening date invalid", () => {
      validateDateString.mockReturnValue({
        isValid: false,
        error: "Invalid date",
      });
      const lab = { ...validLab, opens: "invalid" };

      const errors = validateLabFull(lab, validOptions);

      expect(errors.opens).toBe("Invalid date");
    });

    test("returns error when date range invalid", () => {
      validateDateRange.mockReturnValue({
        isValid: false,
        error: "Invalid range",
      });

      const errors = validateLabFull(validLab, validOptions);

      expect(errors.closes).toBe("Invalid range");
    });

    test("skips range validation when individual dates invalid", () => {
      validateDateString.mockReturnValue({ isValid: false, error: "Invalid" });
      const lab = { ...validLab, opens: "bad" };

      validateLabFull(lab, validOptions);

      expect(validateDateRange).not.toHaveBeenCalled();
    });
  });

  describe("Collections Validation", () => {
    test.each([
      [
        [],
        "timeSlots",
        "At least one valid time slot (positive number) must be selected",
      ],
      [
        undefined,
        "timeSlots",
        "At least one valid time slot (positive number) must be selected",
      ],
      [
        [0, -10],
        "timeSlots",
        "At least one valid time slot (positive number) must be selected",
      ],
      [[], "keywords", "At least one keyword must be added"],
      [["", "  "], "keywords", "At least one keyword must be added"],
    ])("validates %s cannot be empty", (value, field, expectedError) => {
      const lab = { ...validLab, [field]: value };

      const errors = validateLabFull(lab, validOptions);

      expect(errors[field]).toBe(expectedError);
    });

    test("accepts valid timeSlots with positive numbers", () => {
      const lab = { ...validLab, timeSlots: [30, 60, 90] };

      const errors = validateLabFull(lab, validOptions);

      expect(errors.timeSlots).toBeUndefined();
    });
  });

  describe("Media Link Validation", () => {
    test("validates image extensions when using link input", () => {
      const lab = { ...validLab, images: ["file.txt"] };
      const options = { ...validOptions, imageInputType: "link" };

      const errors = validateLabFull(lab, options);

      expect(errors.images).toBe(
        "Image link must end with a valid image extension (e.g., .jpg, .png)"
      );
    });

    test("validates PDF extension when using link input", () => {
      const lab = { ...validLab, docs: ["file.docx"] };
      const options = { ...validOptions, docInputType: "link" };

      const errors = validateLabFull(lab, options);

      expect(errors.docs).toBe('Document link must end with ".pdf"');
    });

    test("skips validation when using file input", () => {
      const lab = { ...validLab, images: ["file.txt"], docs: ["file.docx"] };

      const errors = validateLabFull(lab, validOptions);

      expect(errors.images).toBeUndefined();
      expect(errors.docs).toBeUndefined();
    });
  });

  describe("Multiple Errors", () => {
    test("returns all errors when multiple fields invalid", () => {
      const lab = {
        ...validLab,
        name: "",
        price: -10,
        timeSlots: [],
      };

      const errors = validateLabFull(lab, validOptions);

      expect(Object.keys(errors).length).toBeGreaterThanOrEqual(3);
    });
  });
});

describe("validateLabQuick", () => {
  const validQuickLab = {
    price: 100,
    auth: "https://auth.example.com",
    accessURI: "https://lab.example.com",
    accessKey: "key123",
    uri: "https://data.example.com/lab.json",
  };

  describe("Required Fields", () => {
    test.each([
      ["accessKey", "", "Access Key is required"],
      ["auth", "", "Authentication URL is required"],
      ["accessURI", "", "Access URI is required"],
      ["uri", "", "Lab Data URL is required"],
    ])("validates %s is required", (field, value, expectedError) => {
      const lab = { ...validQuickLab, [field]: value };

      const errors = validateLabQuick(lab);

      expect(errors[field]).toBe(expectedError);
    });
  });

  describe("Price Validation", () => {
    test.each([
      [0, undefined],
      ["", "Price is required"],
      [-25, "Price must be a positive number or zero"],
    ])("handles price=%s", (price, expectedError) => {
      const lab = { ...validQuickLab, price };

      const errors = validateLabQuick(lab);

      if (expectedError) {
        expect(errors.price).toBe(expectedError);
      } else {
        expect(errors.price).toBeUndefined();
      }
    });
  });

  describe("External URI Validation", () => {
    test.each([
      ["https://example.com", undefined],
      ["http://example.com", undefined],
      ["ftp://files.com", undefined],
      ["example.com", "It must be an external URL"],
      [
        "https://invalid url",
        "Invalid external URI format. Must be a valid URL starting with http(s):// or ftp://",
      ],
    ])("validates URI: %s", (uri, expectedError) => {
      const lab = { ...validQuickLab, uri };

      const errors = validateLabQuick(lab);

      if (expectedError) {
        expect(errors.uri).toBe(expectedError);
      } else {
        expect(errors.uri).toBeUndefined();
      }
    });
  });
});
