/**
 * Unit Tests for Booking Validation Utilities
 *
 * Tests pure validation functions for booking management.
 * Focuses on business rules, date logic, and edge cases.
 *
 * Test Behaviors:
 * - Slot availability checking with overlap detection
 * - Booking validation (required fields, date logic)
 * - Cancellation and modification rules
 * - Time-based access control
 * - Status determination based on current time
 */

import {
  isSlotAvailable,
  validateBooking,
  canCancelBooking,
  canModifyBooking,
  getBookingStatus,
  canAccessLab,
} from "../bookingValidation";
import { timePeriodsOverlap } from "../timeHelpers";

// Mock timePeriodsOverlap to isolate booking validation logic
jest.mock("../timeHelpers", () => ({
  timePeriodsOverlap: jest.fn(),
}));

describe("isSlotAvailable", () => {
  const slot = {
    startDate: "2024-06-01T10:00:00",
    endDate: "2024-06-01T12:00:00",
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns true when no existing bookings", () => {
    const result = isSlotAvailable(slot, []);

    expect(result).toBe(true);
    expect(timePeriodsOverlap).not.toHaveBeenCalled();
  });

  test("returns true when no overlapping bookings", () => {
    timePeriodsOverlap.mockReturnValue(false);
    const existingBookings = [
      { startDate: "2024-06-01T08:00:00", endDate: "2024-06-01T09:00:00" },
    ];

    const result = isSlotAvailable(slot, existingBookings);

    expect(result).toBe(true);
    expect(timePeriodsOverlap).toHaveBeenCalledTimes(1);
  });

  test("returns false when slot overlaps with existing booking", () => {
    timePeriodsOverlap.mockReturnValue(true);
    const existingBookings = [
      { startDate: "2024-06-01T11:00:00", endDate: "2024-06-01T13:00:00" },
    ];

    const result = isSlotAvailable(slot, existingBookings);

    expect(result).toBe(false);
  });

  test("checks all existing bookings for conflicts", () => {
    timePeriodsOverlap.mockReturnValueOnce(false).mockReturnValueOnce(true);
    const existingBookings = [
      { startDate: "2024-06-01T08:00:00", endDate: "2024-06-01T09:00:00" },
      { startDate: "2024-06-01T11:00:00", endDate: "2024-06-01T13:00:00" },
    ];

    const result = isSlotAvailable(slot, existingBookings);

    expect(result).toBe(false);
    expect(timePeriodsOverlap).toHaveBeenCalledTimes(2);
  });

  test("handles undefined existingBookings parameter", () => {
    const result = isSlotAvailable(slot);

    expect(result).toBe(true);
  });
});

describe("validateBooking", () => {
  const validBooking = {
    labId: "lab-123",
    startDate: new Date(Date.now() + 86400000).toISOString(), // tomorrow
    endDate: new Date(Date.now() + 90000000).toISOString(), // tomorrow + 1 hour
    userAccount: "0xUser123",
    purpose: "Research experiment",
  };

  describe("Required Fields", () => {
    test.each([
      ["labId", { ...validBooking, labId: null }, "Lab ID is required"],
      [
        "startDate",
        { ...validBooking, startDate: null },
        "Start date is required",
      ],
      ["endDate", { ...validBooking, endDate: null }, "End date is required"],
      [
        "userAccount",
        { ...validBooking, userAccount: null },
        "User account is required",
      ],
      ["purpose", { ...validBooking, purpose: "" }, "Purpose is required"],
      ["purpose", { ...validBooking, purpose: "   " }, "Purpose is required"],
    ])("validates %s is required", (field, booking, expectedError) => {
      const result = validateBooking(booking);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(expectedError);
    });

    test("returns valid when all required fields present", () => {
      const result = validateBooking(validBooking);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("Date Logic Validation", () => {
    test("rejects when end date is before start date", () => {
      const booking = {
        ...validBooking,
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 3600000).toISOString(), // earlier
      };

      const result = validateBooking(booking);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("End date must be after start date");
    });

    test("rejects when end date equals start date", () => {
      const sameDate = new Date(Date.now() + 86400000).toISOString();
      const booking = {
        ...validBooking,
        startDate: sameDate,
        endDate: sameDate,
      };

      const result = validateBooking(booking);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("End date must be after start date");
    });

    test("rejects when start date is in the past", () => {
      const booking = {
        ...validBooking,
        startDate: new Date(Date.now() - 86400000).toISOString(), // yesterday
        endDate: new Date(Date.now() + 3600000).toISOString(),
      };

      const result = validateBooking(booking);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Start date cannot be in the past");
    });
  });

  describe("Multiple Errors", () => {
    test("returns all validation errors when multiple fields invalid", () => {
      const booking = {
        labId: null,
        startDate: new Date(Date.now() - 86400000).toISOString(),
        endDate: new Date(Date.now() - 3600000).toISOString(),
        userAccount: null,
        purpose: "",
      };

      const result = validateBooking(booking);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });
  });
});

describe("canCancelBooking", () => {
  const fixedNow = new Date("2026-01-01T00:00:00Z");

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(fixedNow);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("allows cancellation when booking is more than 24 hours away", () => {
    const booking = {
      startDate: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(), // 25 hours
    };

    expect(canCancelBooking(booking)).toBe(true);
  });

  test("prevents cancellation when booking is less than 24 hours away", () => {
    const booking = {
      startDate: new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString(), // 23 hours
    };

    expect(canCancelBooking(booking)).toBe(false);
  });

  test("uses custom minimum hours parameter", () => {
    const booking = {
      startDate: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(), // 6 hours
    };

    expect(canCancelBooking(booking, 12)).toBe(false);
    expect(canCancelBooking(booking, 3)).toBe(true);
  });

  test("handles edge case at exact boundary", () => {
    const booking = {
      startDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // exactly 24 hours
    };

    expect(canCancelBooking(booking, 24)).toBe(true);
  });
});

describe("canModifyBooking", () => {
  const fixedNow = new Date("2026-01-01T00:00:00Z");

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(fixedNow);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("allows modification when booking is more than 48 hours away", () => {
    const booking = {
      startDate: new Date(Date.now() + 49 * 60 * 60 * 1000).toISOString(), // 49 hours
    };

    expect(canModifyBooking(booking)).toBe(true);
  });

  test("prevents modification when booking is less than 48 hours away", () => {
    const booking = {
      startDate: new Date(Date.now() + 47 * 60 * 60 * 1000).toISOString(), // 47 hours
    };

    expect(canModifyBooking(booking)).toBe(false);
  });

  test("uses custom minimum hours parameter", () => {
    const booking = {
      startDate: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(), // 12 hours
    };

    expect(canModifyBooking(booking, 24)).toBe(false);
    expect(canModifyBooking(booking, 6)).toBe(true);
  });
});

describe("getBookingStatus", () => {
  test("returns cancelled when booking is cancelled", () => {
    const booking = {
      cancelled: true,
      startDate: new Date(Date.now() + 86400000).toISOString(),
      endDate: new Date(Date.now() + 90000000).toISOString(),
    };

    expect(getBookingStatus(booking)).toBe("cancelled");
  });

  test("returns upcoming when current time is before start", () => {
    const booking = {
      startDate: new Date(Date.now() + 86400000).toISOString(),
      endDate: new Date(Date.now() + 90000000).toISOString(),
    };

    expect(getBookingStatus(booking)).toBe("upcoming");
  });

  test("returns active when current time is between start and end", () => {
    const booking = {
      startDate: new Date(Date.now() - 3600000).toISOString(),
      endDate: new Date(Date.now() + 3600000).toISOString(),
    };

    expect(getBookingStatus(booking)).toBe("active");
  });

  test("returns completed when current time is after end", () => {
    const booking = {
      startDate: new Date(Date.now() - 7200000).toISOString(),
      endDate: new Date(Date.now() - 3600000).toISOString(),
    };

    expect(getBookingStatus(booking)).toBe("completed");
  });

  test("returns active at exact start time boundary", () => {
    const now = new Date();
    const booking = {
      startDate: now.toISOString(),
      endDate: new Date(now.getTime() + 3600000).toISOString(),
    };

    expect(getBookingStatus(booking)).toBe("active");
  });
});

describe("canAccessLab", () => {
  test("prevents access when booking is cancelled", () => {
    const booking = {
      cancelled: true,
      startDate: new Date(Date.now() - 60000).toISOString(), // 1 min ago
      endDate: new Date(Date.now() + 3600000).toISOString(),
    };

    expect(canAccessLab(booking)).toBe(false);
  });

  test("allows access during booking time", () => {
    const booking = {
      startDate: new Date(Date.now() - 60000).toISOString(), // 1 min ago
      endDate: new Date(Date.now() + 3600000).toISOString(), // 1 hour ahead
    };

    expect(canAccessLab(booking)).toBe(true);
  });

  test("allows early access 5 minutes before start by default", () => {
    const booking = {
      startDate: new Date(Date.now() + 4 * 60 * 1000).toISOString(), // 4 min ahead
      endDate: new Date(Date.now() + 3600000).toISOString(),
    };

    expect(canAccessLab(booking)).toBe(true);
  });

  test("prevents access before early access window", () => {
    const booking = {
      startDate: new Date(Date.now() + 6 * 60 * 1000).toISOString(), // 6 min ahead
      endDate: new Date(Date.now() + 3600000).toISOString(),
    };

    expect(canAccessLab(booking)).toBe(false);
  });

  test("prevents access after booking ends", () => {
    const booking = {
      startDate: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
      endDate: new Date(Date.now() - 60000).toISOString(), // 1 min ago
    };

    expect(canAccessLab(booking)).toBe(false);
  });

  test("uses custom early access minutes parameter", () => {
    const booking = {
      startDate: new Date(Date.now() + 8 * 60 * 1000).toISOString(), // 8 min ahead
      endDate: new Date(Date.now() + 3600000).toISOString(),
    };

    expect(canAccessLab(booking, 5)).toBe(false);
    expect(canAccessLab(booking, 10)).toBe(true);
  });

  test("handles edge case at exact early access boundary", () => {
    const booking = {
      startDate: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // exactly 5 min
      endDate: new Date(Date.now() + 3600000).toISOString(),
    };

    expect(canAccessLab(booking, 5)).toBe(true);
  });
});
