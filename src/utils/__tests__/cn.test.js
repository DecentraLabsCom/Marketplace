/**
 * Unit Tests for Class Name Utility (cn)
 *
 * Tests conditional class name concatenation utility.
 * Similar to clsx/classnames but project-specific.
 *
 * Test Behaviors:
 * - String concatenation
 * - Conditional objects (key-value pairs)
 * - Array handling (including nested)
 * - Falsy value filtering
 * - Mixed input types
 * - Edge cases
 */

import { cn } from "../cn";

describe("cn - Class Name Utility", () => {
  describe("String Concatenation", () => {
    test("concatenates multiple strings", () => {
      expect(cn("class1", "class2", "class3")).toBe("class1 class2 class3");
    });

    test("concatenates single string", () => {
      expect(cn("single-class")).toBe("single-class");
    });

    test("returns empty string when no arguments", () => {
      expect(cn()).toBe("");
    });
  });

  describe("Conditional Objects", () => {
    test("includes classes when condition is true", () => {
      expect(cn({ active: true, disabled: false })).toBe("active");
    });

    test("includes multiple true conditions", () => {
      expect(cn({ active: true, selected: true, disabled: false })).toBe(
        "active selected"
      );
    });

    test("excludes all classes when all conditions false", () => {
      expect(cn({ active: false, disabled: false })).toBe("");
    });

    test("handles truthy values (not just true)", () => {
      expect(cn({ active: 1, selected: "yes", disabled: 0 })).toBe(
        "active selected"
      );
    });
  });

  describe("Array Handling", () => {
    test("concatenates array of strings", () => {
      expect(cn(["class1", "class2"])).toBe("class1 class2");
    });

    test("handles nested arrays", () => {
      expect(cn(["class1", ["class2", "class3"]])).toBe("class1 class2 class3");
    });

    test("handles deeply nested arrays", () => {
      expect(cn(["class1", ["class2", ["class3", "class4"]]])).toBe(
        "class1 class2 class3 class4"
      );
    });

    test("handles empty arrays", () => {
      expect(cn([])).toBe("");
    });
  });

  describe("Falsy Values", () => {
    test.each([
      [null, "null"],
      [undefined, "undefined"],
      [false, "false"],
      [0, "zero"],
      ["", "empty string"],
    ])("filters out %s", (value) => {
      expect(cn("base", value, "end")).toBe("base end");
    });

    test("filters out falsy values in arrays", () => {
      expect(cn(["class1", null, "class2", false, "class3"])).toBe(
        "class1 class2 class3"
      );
    });

    test("handles all falsy values", () => {
      expect(cn(null, undefined, false, 0, "")).toBe("");
    });
  });

  describe("Mixed Input Types", () => {
    test("combines strings and objects", () => {
      expect(cn("base", { active: true, disabled: false })).toBe("base active");
    });

    test("combines strings and arrays", () => {
      expect(cn("base", ["class1", "class2"])).toBe("base class1 class2");
    });

    test("combines all input types", () => {
      expect(
        cn(
          "base",
          { active: true, disabled: false },
          ["array1", "array2"],
          "end"
        )
      ).toBe("base active array1 array2 end");
    });

    test("handles complex nested scenario", () => {
      const isActive = true;
      const isDisabled = false;

      expect(
        cn(
          "btn",
          {
            "btn-active": isActive,
            "btn-disabled": isDisabled,
          },
          ["btn-primary", "btn-lg"],
          isActive && "active-state"
        )
      ).toBe("btn btn-active btn-primary btn-lg active-state");
    });
  });

  describe("Edge Cases", () => {
    test("handles objects with empty string keys", () => {
      expect(cn({ "": true, valid: true })).toBe(" valid");
    });

    test("handles whitespace in strings", () => {
      expect(cn("class1  class2", "class3")).toBe("class1  class2 class3");
    });

    test("handles duplicate classes", () => {
      expect(cn("active", "active", "active")).toBe("active active active");
    });

    test("handles object with no properties", () => {
      expect(cn({})).toBe("");
    });

    test("handles array with only falsy values", () => {
      expect(cn([null, false, undefined])).toBe("");
    });
  });

  describe("Real-World Use Cases", () => {
    test("tailwind conditional classes", () => {
      const isError = true;
      const isLoading = false;

      expect(
        cn(
          "px-4 py-2 rounded",
          {
            "bg-red-500": isError,
            "bg-gray-500": isLoading,
          },
          isError && "text-white"
        )
      ).toBe("px-4 py-2 rounded bg-red-500 text-white");
    });

    test("button variants", () => {
      const variant = "primary";
      const size = "lg";

      expect(
        cn("btn", {
          "btn-primary": variant === "primary",
          "btn-secondary": variant === "secondary",
          "btn-sm": size === "sm",
          "btn-lg": size === "lg",
        })
      ).toBe("btn btn-primary btn-lg");
    });

    test("state-based styling", () => {
      const state = { hover: true, focus: false, disabled: false };

      expect(
        cn("input", {
          "input-hover": state.hover,
          "input-focus": state.focus,
          "input-disabled": state.disabled,
        })
      ).toBe("input input-hover");
    });
  });
});
