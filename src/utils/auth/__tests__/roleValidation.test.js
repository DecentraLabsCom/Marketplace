/**
 * Unit Tests for Role-Based Access Control Utilities
 *
 * Tests SSO role validation following eduPersonAffiliation standards.
 * Focuses on business rules, edge cases, and access control logic.
 *
 * Test Behaviors:
 * - Provider role validation (allowed/denied lists)
 * - Admin role detection
 * - Role display name mapping
 * - Case-insensitive matching
 * - Scoped role handling
 * - Null/undefined safety
 */

import {
  PROVIDER_ALLOWED_ROLES,
  PROVIDER_DENIED_ROLES,
  validateProviderRole,
  hasAdminRole,
  getRoleDisplayName,
} from "../roleValidation";

describe("validateProviderRole", () => {
  describe("Allowed Roles", () => {
    test.each([
      ["faculty", "Faculty members can register"],
      ["staff", "Staff members can register"],
      ["employee", "Employees can register"],
    ])("accepts %s as valid provider role", (role) => {
      const result = validateProviderRole(role);

      expect(result.isValid).toBe(true);
      expect(result.reason).toBe("");
    });

    test("accepts role with uppercase letters", () => {
      const result = validateProviderRole("FACULTY");

      expect(result.isValid).toBe(true);
    });

    test("accepts role with mixed case", () => {
      const result = validateProviderRole("FaCuLtY");

      expect(result.isValid).toBe(true);
    });

    test("accepts role with leading/trailing whitespace", () => {
      const result = validateProviderRole("  faculty  ");

      expect(result.isValid).toBe(true);
    });

    test("accepts role that contains allowed keyword", () => {
      const result = validateProviderRole("faculty-member");

      expect(result.isValid).toBe(true);
    });
  });

  describe("Denied Roles", () => {
    test.each([
      ["student", "Students"],
      ["alum", "Alumni"],
      ["library-walk-in", "Walk-in users"],
    ])("denies %s role", (role) => {
      const result = validateProviderRole(role);

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain("Students and learners are not eligible");
    });

    test("denies student role regardless of case", () => {
      const result = validateProviderRole("STUDENT");

      expect(result.isValid).toBe(false);
    });

    test("denies role that contains denied keyword", () => {
      const result = validateProviderRole("undergraduate-student");

      expect(result.isValid).toBe(false);
    });

    test("denied roles take precedence over allowed roles", () => {
      const result = validateProviderRole("student-staff");

      expect(result.isValid).toBe(false);
    });
  });

  describe("Unknown Roles", () => {
    test("rejects unknown role", () => {
      const result = validateProviderRole("unknown-role");

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain(
        "does not have provider registration privileges"
      );
    });

    test("includes role name in error message", () => {
      const result = validateProviderRole("visitor");

      expect(result.reason).toContain("visitor");
    });

    test("handles empty string role", () => {
      const result = validateProviderRole("");

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain("Unknown");
    });

    test("handles null role", () => {
      const result = validateProviderRole(null);

      expect(result.isValid).toBe(false);
    });

    test("handles undefined role", () => {
      const result = validateProviderRole(undefined);

      expect(result.isValid).toBe(false);
    });
  });

  describe("Scoped Roles", () => {
    test("accepts when scoped role is in allowed list", () => {
      const result = validateProviderRole("unknown", "faculty");

      expect(result.isValid).toBe(true);
    });

    test("denies when scoped role is in denied list", () => {
      const result = validateProviderRole("unknown", "student");

      expect(result.isValid).toBe(false);
    });

    test("accepts when primary role is denied but scoped role is allowed", () => {
      const result = validateProviderRole("visitor", "staff");

      expect(result.isValid).toBe(true);
    });

    test("denies when primary role is allowed but scoped role is denied", () => {
      const result = validateProviderRole("staff", "student");

      expect(result.isValid).toBe(false);
    });

    test("handles scoped role with whitespace", () => {
      const result = validateProviderRole("unknown", "  employee  ");

      expect(result.isValid).toBe(true);
    });

    test("handles empty scoped role", () => {
      const result = validateProviderRole("faculty", "");

      expect(result.isValid).toBe(true);
    });
  });
});

describe("hasAdminRole", () => {
  test("returns true for staff role", () => {
    expect(hasAdminRole("staff")).toBe(true);
  });

  test("returns true for staff role with uppercase", () => {
    expect(hasAdminRole("STAFF")).toBe(true);
  });

  test("returns true for staff role with mixed case", () => {
    expect(hasAdminRole("StAfF")).toBe(true);
  });

  test("returns true when staff is in scoped role", () => {
    expect(hasAdminRole("unknown", "staff")).toBe(true);
  });

  test("returns true when role contains staff keyword", () => {
    expect(hasAdminRole("admin-staff")).toBe(true);
  });

  test("returns true for faculty role", () => {
    expect(hasAdminRole("faculty")).toBe(true);
  });

  test("returns true for employee role", () => {
    expect(hasAdminRole("employee")).toBe(true);
  });

  test.each([
    ["student"],
    ["member"],
    ["affiliate"],
    ["alum"],
    ["library-walk-in"],
  ])("returns false for non-admin role: %s", (role) => {
    expect(hasAdminRole(role)).toBe(false);
  });

  test("returns false for empty string", () => {
    expect(hasAdminRole("")).toBe(false);
  });

  test("returns false for null", () => {
    expect(hasAdminRole(null)).toBe(false);
  });

  test("returns false for undefined", () => {
    expect(hasAdminRole(undefined)).toBe(false);
  });

  test("returns false for unknown role", () => {
    expect(hasAdminRole("visitor")).toBe(false);
  });
});

describe("getRoleDisplayName", () => {
  describe("Standard Role Mapping", () => {
    test.each([
      ["faculty", "Faculty"],
      ["staff", "Staff"],
      ["employee", "Employee"],
      ["student", "Student"],
      ["alum", "Alumni"],
      ["library-walk-in", "Library Walk-in User"],
    ])("maps %s to %s", (role, expected) => {
      expect(getRoleDisplayName(role)).toBe(expected);
    });
  });

  describe("Case Insensitive Mapping", () => {
    test("maps uppercase role correctly", () => {
      expect(getRoleDisplayName("FACULTY")).toBe("Faculty");
    });

    test("maps mixed case role correctly", () => {
      expect(getRoleDisplayName("FaCuLtY")).toBe("Faculty");
    });
  });

  describe("Partial Role Matching", () => {
    test("maps role containing standard keyword", () => {
      expect(getRoleDisplayName("faculty-member")).toBe("Faculty");
    });

    test("maps role with prefix", () => {
      expect(getRoleDisplayName("senior-staff")).toBe("Staff");
    });

    test("finds first matching keyword", () => {
      expect(getRoleDisplayName("staff-student")).toBe("Staff");
    });
  });

  describe("Unknown Roles", () => {
    test("capitalizes first letter of unknown role", () => {
      expect(getRoleDisplayName("visitor")).toBe("Visitor");
    });

    test("lowercases rest of unknown role", () => {
      expect(getRoleDisplayName("VISITOR")).toBe("Visitor");
    });

    test("handles multi-word unknown role", () => {
      expect(getRoleDisplayName("guest-user")).toBe("Guest-user");
    });
  });

  describe("Edge Cases", () => {
    test('returns "Unknown" for null', () => {
      expect(getRoleDisplayName(null)).toBe("Unknown");
    });

    test('returns "Unknown" for undefined', () => {
      expect(getRoleDisplayName(undefined)).toBe("Unknown");
    });

    test('returns "Unknown" for empty string', () => {
      expect(getRoleDisplayName("")).toBe("Unknown");
    });

    test("handles single character role", () => {
      expect(getRoleDisplayName("a")).toBe("A");
    });
  });
});

describe("Role Constants", () => {
  test("PROVIDER_ALLOWED_ROLES contains expected roles", () => {
    expect(PROVIDER_ALLOWED_ROLES).toEqual(["faculty", "staff", "employee"]);
  });

  test("PROVIDER_DENIED_ROLES contains expected roles", () => {
    expect(PROVIDER_DENIED_ROLES).toEqual([
      "student",
      "alum",
      "library-walk-in",
    ]);
  });

  test("allowed and denied roles do not overlap", () => {
    const overlap = PROVIDER_ALLOWED_ROLES.filter((role) =>
      PROVIDER_DENIED_ROLES.includes(role)
    );

    expect(overlap).toHaveLength(0);
  });
});
