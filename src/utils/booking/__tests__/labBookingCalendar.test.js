/**
 * Unit Tests for Lab Booking Calendar Utilities
 *
 * Simplified tests to avoid memory issues.
 * Focuses on critical business logic without heavy mocking.
 *
 * Test Behaviors:
 * - Time slot generation basics
 * - Booking overlap detection
 * - Day content rendering
 */

import { generateTimeOptions, renderDayContents, isDayFullyUnavailable } from "../labBookingCalendar";
import * as dateFns from "date-fns";
import { getBookingStatusText } from "../bookingStatus";
import { isSameCalendarDay } from "@/utils/dates/parseDateSafe";

// Mock external dependencies to isolate unit tests
jest.mock("date-fns", () => ({
  format: jest.fn((date) => {
    const h = date.getHours();
    const m = date.getMinutes();
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }),
  isToday: jest.fn(() => false),
}));

jest.mock("../bookingStatus", () => ({
  getBookingStatusText: jest.fn(() => "Active"),
}));

jest.mock("@/utils/dates/parseDateSafe", () => ({
  isSameCalendarDay: jest.fn(() => false),
}));

jest.mock("@/utils/dev/logger", () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe("generateTimeOptions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Basic slot generation", () => {
    test("generates 24 slots for 60-minute interval", () => {
      const date = new Date("2025-06-15T00:00:00");

      const result = generateTimeOptions({
        date,
        interval: 60,
        bookingInfo: [],
      });

      expect(result).toHaveLength(24);
      expect(result[0]).toMatchObject({
        value: "00:00",
        label: "00:00",
        disabled: false,
        isReserved: false,
      });
    });

    test("generates 48 slots for 30-minute interval", () => {
      const date = new Date("2025-06-15T00:00:00");

      const result = generateTimeOptions({
        date,
        interval: 30,
        bookingInfo: [],
      });

      expect(result).toHaveLength(48);
    });

    test("all slots have required properties", () => {
      const date = new Date("2025-06-15T00:00:00");

      const result = generateTimeOptions({
        date,
        interval: 60,
        bookingInfo: [],
      });

      // Validate slot structure contract
      result.forEach((slot) => {
        expect(slot).toHaveProperty("value");
        expect(slot).toHaveProperty("label");
        expect(slot).toHaveProperty("disabled");
        expect(slot).toHaveProperty("isReserved");
      });
    });
  });

  describe("Past slot blocking", () => {
    test("blocks past slots when date is today", () => {
      // Mock current time for time-sensitive logic
      const realDate = Date;
      const mockNow = new Date("2025-06-15T14:30:00");

      global.Date = jest.fn((arg) => {
        if (arg) return new realDate(arg);
        return mockNow;
      });
      global.Date.prototype = realDate.prototype;

      dateFns.isToday.mockReturnValue(true);

      const date = new Date("2025-06-15T00:00:00");

      const result = generateTimeOptions({
        date,
        interval: 60,
        bookingInfo: [],
      });

      // Verify time-based slot disabling
      expect(result[10].disabled).toBe(true); // 10:00 (past)
      expect(result[14].disabled).toBe(true); // 14:00 (past)
      expect(result[15].disabled).toBe(false); // 15:00 (future)

      global.Date = realDate;
    });

    test("does not block slots for future dates", () => {
      dateFns.isToday.mockReturnValue(false);

      const date = new Date("2025-06-20T00:00:00");

      const result = generateTimeOptions({
        date,
        interval: 60,
        bookingInfo: [],
      });

      const allEnabled = result.every((slot) => !slot.disabled);
      expect(allEnabled).toBe(true);
    });
  });

  describe("Availability metadata", () => {
    test("disables slots on days outside availableDays", () => {
      dateFns.isToday.mockReturnValue(false);
      const date = new Date("2025-06-15T00:00:00"); // Sunday

      const result = generateTimeOptions({
        date,
        interval: 60,
        bookingInfo: [],
        lab: {
          availableDays: ["MONDAY", "TUESDAY"],
        },
      });

      const allDisabled = result.every((slot) => slot.disabled);
      expect(allDisabled).toBe(true);
    });

    test("disables slots outside availableHours window", () => {
      dateFns.isToday.mockReturnValue(false);
      const date = new Date("2025-06-16T00:00:00"); // Monday

      const result = generateTimeOptions({
        date,
        interval: 60,
        bookingInfo: [],
        lab: {
          availableDays: ["MONDAY"],
          availableHours: { start: "09:00", end: "17:00" },
        },
      });

      const eightAM = result.find((slot) => slot.value === "08:00");
      const noon = result.find((slot) => slot.value === "12:00");
      const sixPM = result.find((slot) => slot.value === "18:00");

      expect(eightAM.disabled).toBe(true);
      expect(noon.disabled).toBe(false);
      expect(sixPM.disabled).toBe(true);
    });

    test("disables slots overlapping maintenance windows", () => {
      dateFns.isToday.mockReturnValue(false);
      const date = new Date("2025-06-16T00:00:00"); // Monday
      const maintenanceStart = Math.floor(
        new Date("2025-06-16T10:00:00").getTime() / 1000
      );
      const maintenanceEnd = Math.floor(
        new Date("2025-06-16T12:00:00").getTime() / 1000
      );

      const result = generateTimeOptions({
        date,
        interval: 60,
        bookingInfo: [],
        lab: {
          availableDays: ["MONDAY"],
          unavailableWindows: [
            { startUnix: maintenanceStart, endUnix: maintenanceEnd },
          ],
        },
      });

      const tenAM = result.find((slot) => slot.value === "10:00");
      const elevenAM = result.find((slot) => slot.value === "11:00");
      const nineAM = result.find((slot) => slot.value === "09:00");

      expect(tenAM.disabled).toBe(true);
      expect(elevenAM.disabled).toBe(true);
      expect(nineAM.disabled).toBe(false);
    });
  });

  describe("Booking overlap detection", () => {
    test("blocks slots that overlap with booking", () => {
      dateFns.isToday.mockReturnValue(false);
      isSameCalendarDay.mockReturnValue(true);

      const date = new Date("2025-06-15T00:00:00");
      const bookingStart = Math.floor(
        new Date("2025-06-15T10:00:00").getTime() / 1000
      );
      const bookingEnd = Math.floor(
        new Date("2025-06-15T12:00:00").getTime() / 1000
      );

      const result = generateTimeOptions({
        date,
        interval: 60,
        bookingInfo: [
          {
            date,
            start: bookingStart,
            end: bookingEnd,
          },
        ],
      });

      // Verify conflict detection logic
      expect(result[10].disabled).toBe(true); // 10:00-11:00 (overlaps)
      expect(result[11].disabled).toBe(true); // 11:00-12:00 (overlaps)
      expect(result[9].disabled).toBe(false); // 09:00-10:00 (before)
      expect(result[12].disabled).toBe(false); // 12:00-13:00 (after)
    });

    test("handles bookings without start/end gracefully", () => {
      dateFns.isToday.mockReturnValue(false);
      isSameCalendarDay.mockReturnValue(true);

      const date = new Date("2025-06-15T00:00:00");

      const result = generateTimeOptions({
        date,
        interval: 60,
        bookingInfo: [{ date, start: null, end: null }],
      });

      const allEnabled = result.every((slot) => !slot.disabled);
      expect(allEnabled).toBe(true);
    });

    test("filters bookings for current day only", () => {
      dateFns.isToday.mockReturnValue(false);
      isSameCalendarDay.mockReturnValue(false);

      const date = new Date("2025-06-15T00:00:00");
      const otherDayStart = Math.floor(
        new Date("2025-06-16T10:00:00").getTime() / 1000
      );
      const otherDayEnd = Math.floor(
        new Date("2025-06-16T12:00:00").getTime() / 1000
      );

      const result = generateTimeOptions({
        date,
        interval: 60,
        bookingInfo: [
          {
            date: new Date("2025-06-16"),
            start: otherDayStart,
            end: otherDayEnd,
          },
        ],
      });

      const allEnabled = result.every((slot) => !slot.disabled);
      expect(allEnabled).toBe(true);
    });
  });

  describe("Edge cases", () => {
    test("handles undefined bookingInfo", () => {
      const date = new Date("2025-06-15T00:00:00");

      const result = generateTimeOptions({
        date,
        interval: 60,
        bookingInfo: undefined,
      });

      expect(result).toHaveLength(24);
    });

    test("handles empty bookingInfo", () => {
      const date = new Date("2025-06-15T00:00:00");

      const result = generateTimeOptions({
        date,
        interval: 60,
        bookingInfo: [],
      });

      expect(result).toHaveLength(24);
    });
  });
});

describe("renderDayContents", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Without bookings", () => {
    test("renders day without tooltip when no bookings", () => {
      isSameCalendarDay.mockReturnValue(false);

      const result = renderDayContents({
        day: 15,
        currentDateRender: new Date("2025-06-15"),
        bookingInfo: [],
      });

      expect(result.props.title).toBeUndefined();
      expect(result.props.children).toBe(15);
    });

    test("handles undefined bookingInfo", () => {
      const result = renderDayContents({
        day: 15,
        currentDateRender: new Date("2025-06-15"),
        bookingInfo: undefined,
      });

      expect(result.props.title).toBeUndefined();
    });
  });

  describe("With bookings", () => {
    test("renders tooltip with booking time range", () => {
      isSameCalendarDay.mockReturnValue(true);
      getBookingStatusText.mockReturnValue("Active");

      const startTimestamp = Math.floor(
        new Date("2025-06-15T10:00:00").getTime() / 1000
      );
      const endTimestamp = Math.floor(
        new Date("2025-06-15T12:00:00").getTime() / 1000
      );

      const result = renderDayContents({
        day: 15,
        currentDateRender: new Date("2025-06-15"),
        bookingInfo: [
          {
            dateString: "2025-06-15",
            start: startTimestamp,
            end: endTimestamp,
            status: 1,
          },
        ],
      });

      expect(result.props.title).toBe("10:00 - 12:00");
    });

    test("includes lab name when available", () => {
      isSameCalendarDay.mockReturnValue(true);
      getBookingStatusText.mockReturnValue("Active");

      const startTimestamp = Math.floor(
        new Date("2025-06-15T10:00:00").getTime() / 1000
      );
      const endTimestamp = Math.floor(
        new Date("2025-06-15T12:00:00").getTime() / 1000
      );

      const result = renderDayContents({
        day: 15,
        currentDateRender: new Date("2025-06-15"),
        bookingInfo: [
          {
            dateString: "2025-06-15",
            start: startTimestamp,
            end: endTimestamp,
            labName: "Chemistry Lab",
            status: 1,
          },
        ],
      });

      expect(result.props.title).toBe("Chemistry Lab: 10:00 - 12:00");
    });

    test("includes status for non-active bookings", () => {
      isSameCalendarDay.mockReturnValue(true);
      getBookingStatusText.mockReturnValue("Cancelled");

      const startTimestamp = Math.floor(
        new Date("2025-06-15T10:00:00").getTime() / 1000
      );
      const endTimestamp = Math.floor(
        new Date("2025-06-15T12:00:00").getTime() / 1000
      );

      const result = renderDayContents({
        day: 15,
        currentDateRender: new Date("2025-06-15"),
        bookingInfo: [
          {
            dateString: "2025-06-15",
            start: startTimestamp,
            end: endTimestamp,
            status: 0,
          },
        ],
      });

      expect(result.props.title).toBe("10:00 - 12:00 (Cancelled)");
    });

    test("handles bookings without timestamps", () => {
      isSameCalendarDay.mockReturnValue(true);
      getBookingStatusText.mockReturnValue("Active");

      const result = renderDayContents({
        day: 15,
        currentDateRender: new Date("2025-06-15"),
        bookingInfo: [
          {
            dateString: "2025-06-15",
            labName: "Biology Lab",
            status: 1,
          },
        ],
      });

      expect(result.props.title).toBe("Booked: Biology Lab");
    });

    test("handles invalid timestamps", () => {
      isSameCalendarDay.mockReturnValue(true);
      getBookingStatusText.mockReturnValue("Active");

      const result = renderDayContents({
        day: 15,
        currentDateRender: new Date("2025-06-15"),
        bookingInfo: [
          {
            dateString: "2025-06-15",
            start: "invalid",
            end: "invalid",
            status: 1,
          },
        ],
      });

      expect(result.props.title).toBe("Booked");
    });

    test("handles multiple bookings on same day", () => {
      isSameCalendarDay.mockReturnValue(true);
      getBookingStatusText.mockReturnValue("Active");

      const booking1Start = Math.floor(
        new Date("2025-06-15T09:00:00").getTime() / 1000
      );
      const booking1End = Math.floor(
        new Date("2025-06-15T10:00:00").getTime() / 1000
      );
      const booking2Start = Math.floor(
        new Date("2025-06-15T14:00:00").getTime() / 1000
      );
      const booking2End = Math.floor(
        new Date("2025-06-15T16:00:00").getTime() / 1000
      );

      const result = renderDayContents({
        day: 15,
        currentDateRender: new Date("2025-06-15"),
        bookingInfo: [
          {
            dateString: "2025-06-15",
            start: booking1Start,
            end: booking1End,
            status: 1,
          },
          {
            dateString: "2025-06-15",
            start: booking2Start,
            end: booking2End,
            labName: "Physics Lab",
            status: 1,
          },
        ],
      });

      expect(result.props.title).toBe(
        "09:00 - 10:00\nPhysics Lab: 14:00 - 16:00"
      );
    });
  });
});

describe("isDayFullyUnavailable", () => {
  test("returns true when day is outside availableDays", () => {
    const date = new Date("2025-06-15T12:00:00"); // Sunday
    const result = isDayFullyUnavailable({
      date,
      lab: { availableDays: ["MONDAY", "TUESDAY"] },
    });

    expect(result).toBe(true);
  });

  test("returns false when day is included in availableDays", () => {
    const date = new Date("2025-06-16T12:00:00"); // Monday
    const result = isDayFullyUnavailable({
      date,
      lab: { availableDays: ["MONDAY", "TUESDAY"] },
    });

    expect(result).toBe(false);
  });

  test("returns true when unavailable window covers full day", () => {
    const date = new Date("2025-06-18T12:00:00");
    const dayStart = new Date("2025-06-18T00:00:00");
    const dayEnd = new Date("2025-06-18T23:59:59");

    const result = isDayFullyUnavailable({
      date,
      lab: {
        unavailableWindows: [
          {
            startUnix: Math.floor(dayStart.getTime() / 1000),
            endUnix: Math.floor(dayEnd.getTime() / 1000),
          },
        ],
      },
    });

    expect(result).toBe(true);
  });
});
