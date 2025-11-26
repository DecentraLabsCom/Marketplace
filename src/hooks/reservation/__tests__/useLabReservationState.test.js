/**
 * Unit Tests for useLabReservationState hook.
 *
 * Tests the lab reservation state management hook.
 *
 * Test Behaviors:
 *
 * - Initial State: Default values and basic initialization
 * - Date Calculations: minDate/maxDate based on lab opens/closes
 * - Available Times: Generation based on duration and existing bookings
 * - Cost Calculation: Total cost based on lab price and duration
 * - Auto Time Selection: First available time selected automatically
 * - Duration Updates: Updates when lab changes
 * - Handlers: State update functions work correctly
 * - Optimistic Updates: Cleanup when real booking appears
 * - Edge Cases: Null lab, empty bookings, invalid dates
 *
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { useLabReservationState } from "../useLabReservationState";

// External dependencies mocking - isolate the hook from external systems
import { useNotifications } from "@/context/NotificationContext";
import { useLabToken } from "@/context/LabTokenContext";
import {
  useReservationRequest,
  useBookingCacheUpdates,
} from "@/hooks/booking/useBookings";
import * as wagmi from "wagmi";
import { isCancelledBooking } from "@/utils/booking/bookingStatus";
import { generateTimeOptions } from "@/utils/booking/labBookingCalendar";
import devLog from "@/utils/dev/logger";

// Mock external contexts to control their behavior and responses
jest.mock("@/context/NotificationContext");
jest.mock("@/context/LabTokenContext");
jest.mock("@/hooks/booking/useBookings");

// Mock blockchain/WAGMI hooks to simulate web3 interactions without real connections
jest.mock("wagmi");

// Mock utility functions to test specific scenarios and edge cases
jest.mock("@/utils/booking/bookingStatus");
jest.mock("@/utils/booking/labBookingCalendar");

// Mock development logger to prevent console noise during test execution
jest.mock("@/utils/dev/logger");

describe("useLabReservationState", () => {
  const mockNotifications = {
    addTemporaryNotification: jest.fn(),
    addErrorNotification: jest.fn(),
  };

  const mockLabToken = {
    calculateReservationCost: jest.fn(),
    formatPrice: jest.fn(),
    refreshTokenData: jest.fn(),
  };

  const mockReservationRequest = {
    mutate: jest.fn(),
    isLoading: false,
  };

  const mockCacheUpdates = {
    removeOptimisticBooking: jest.fn(),
  };

  const mockLab = {
    id: "lab-1",
    name: "AI Lab",
    price: 100,
    timeSlots: [15, 30, 60],
    opens: 1735689600, // 2025-01-01
    closes: 1767139200, // 2025-12-31
  };

  const mockBookings = [
    { id: "1", start: "1704110400", labId: "lab-1", status: 1 },
    { id: "2", start: "1704114000", labId: "lab-1", status: 0 },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    useNotifications.mockReturnValue(mockNotifications);
    useLabToken.mockReturnValue(mockLabToken);
    useReservationRequest.mockReturnValue(mockReservationRequest);
    useBookingCacheUpdates.mockReturnValue(mockCacheUpdates);

    jest.spyOn(wagmi, "useWaitForTransactionReceipt").mockReturnValue({
      data: null,
      isLoading: false,
      isSuccess: false,
      isError: false,
      error: null,
    });

    mockLabToken.calculateReservationCost.mockReturnValue(1500n);
    mockLabToken.formatPrice.mockImplementation((val) => `$${val}`);
    isCancelledBooking.mockReturnValue(false);
    generateTimeOptions.mockReturnValue([
      { value: "09:00", label: "09:00 AM", disabled: false },
      { value: "10:00", label: "10:00 AM", disabled: false },
    ]);

    devLog.log = jest.fn();
    devLog.warn = jest.fn();
  });

  describe("Initial State", () => {
    test("initializes with default values", () => {
      const { result } = renderHook(() =>
        useLabReservationState({
          selectedLab: null,
          labBookings: [],
          isSSO: false,
        })
      );

      expect(result.current.duration).toBe(15);
      expect(result.current.selectedTime).toBe("");
      expect(result.current.isBooking).toBe(false);
      expect(result.current.forceRefresh).toBe(0);
      expect(result.current.date).toBeInstanceOf(Date);
    });

    test("sets duration to first timeSlot when lab provided", () => {
      const { result } = renderHook(() =>
        useLabReservationState({
          selectedLab: mockLab,
          labBookings: [],
          isSSO: false,
        })
      );

      expect(result.current.duration).toBe(15);
    });

    test("handles lab without timeSlots array", () => {
      const labNoSlots = { ...mockLab, timeSlots: null };

      const { result } = renderHook(() =>
        useLabReservationState({
          selectedLab: labNoSlots,
          labBookings: [],
          isSSO: false,
        })
      );

      expect(result.current.duration).toBe(15);
    });
  });

  describe("Date Calculations", () => {
    test("sets minDate to today when lab opens in the past", () => {
      const pastLab = { ...mockLab, opens: 1577836800 }; // 2020-01-01

      const { result } = renderHook(() =>
        useLabReservationState({
          selectedLab: pastLab,
          labBookings: [],
          isSSO: false,
        })
      );

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      expect(result.current.minDate.getTime()).toBeGreaterThanOrEqual(
        today.getTime()
      );
    });

    test("sets minDate to opens date when lab opens in the future", () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);
      const futureLab = { ...mockLab, opens: Math.floor(futureDate.getTime() / 1000) };

      const { result } = renderHook(() =>
        useLabReservationState({
          selectedLab: futureLab,
          labBookings: [],
          isSSO: false,
        })
      );

      expect(result.current.minDate.getDate()).toBe(futureDate.getDate());
    });

    test("sets maxDate from lab closes date", () => {
      const { result } = renderHook(() =>
        useLabReservationState({
          selectedLab: mockLab,
          labBookings: [],
          isSSO: false,
        })
      );

      expect(result.current.maxDate).toBeInstanceOf(Date);
      expect(result.current.maxDate.getFullYear()).toBe(2025);
    });

    test("handles invalid opens date gracefully", () => {
      const invalidLab = { ...mockLab, opens: "invalid-date" };

      const { result } = renderHook(() =>
        useLabReservationState({
          selectedLab: invalidLab,
          labBookings: [],
          isSSO: false,
        })
      );

      expect(result.current.minDate).toBeInstanceOf(Date);
    });
  });

  describe("Available Times Generation", () => {
    test("generates available times based on duration and bookings", () => {
      const { result } = renderHook(() =>
        useLabReservationState({
          selectedLab: mockLab,
          labBookings: mockBookings,
          isSSO: false,
        })
      );

      expect(generateTimeOptions).toHaveBeenCalledWith({
        date: expect.any(Date),
        interval: 15,
        bookingInfo: expect.any(Array),
      });
      expect(result.current.availableTimes).toHaveLength(2);
    });

    test("filters out cancelled bookings from time generation", () => {
      isCancelledBooking.mockImplementation((booking) => booking.status === 2);
      const bookingsWithCancelled = [
        ...mockBookings,
        { id: "3", start: "1704117600", labId: "lab-1", status: 2 },
      ];

      renderHook(() =>
        useLabReservationState({
          selectedLab: mockLab,
          labBookings: bookingsWithCancelled,
          isSSO: false,
        })
      );

      const calledBookings = generateTimeOptions.mock.calls[0][0].bookingInfo;
      expect(calledBookings).toHaveLength(2);
    });

    test("returns empty array when no lab selected", () => {
      const { result } = renderHook(() =>
        useLabReservationState({
          selectedLab: null,
          labBookings: [],
          isSSO: false,
        })
      );

      expect(result.current.availableTimes).toEqual([]);
    });
  });

  describe("Cost Calculation", () => {
    test("calculates total cost based on lab price and duration", () => {
      const { result } = renderHook(() =>
        useLabReservationState({
          selectedLab: mockLab,
          labBookings: [],
          isSSO: false,
        })
      );

      expect(mockLabToken.calculateReservationCost).toHaveBeenCalledWith(
        100,
        15
      );
      expect(result.current.totalCost).toBe(1500n);
    });

    test("returns 0 cost when no lab selected", () => {
      const { result } = renderHook(() =>
        useLabReservationState({
          selectedLab: null,
          labBookings: [],
          isSSO: false,
        })
      );

      expect(result.current.totalCost).toBe(0n);
    });

    test("recalculates cost when duration changes", () => {
      const { result } = renderHook(() =>
        useLabReservationState({
          selectedLab: mockLab,
          labBookings: [],
          isSSO: false,
        })
      );

      act(() => {
        result.current.handleDurationChange(30);
      });

      expect(mockLabToken.calculateReservationCost).toHaveBeenCalledWith(
        100,
        30
      );
    });
  });

  describe("Auto Time Selection", () => {
    test("selects first available time automatically", () => {
      const { result } = renderHook(() =>
        useLabReservationState({
          selectedLab: mockLab,
          labBookings: [],
          isSSO: false,
        })
      );

      expect(result.current.selectedTime).toBe("09:00");
    });

    test("handles no available times gracefully", () => {
      generateTimeOptions.mockReturnValue([
        { value: "09:00", label: "09:00 AM", disabled: true },
        { value: "10:00", label: "10:00 AM", disabled: true },
      ]);

      const { result } = renderHook(() =>
        useLabReservationState({
          selectedLab: mockLab,
          labBookings: [],
          isSSO: false,
        })
      );

      expect(result.current.selectedTime).toBe("");
    });
  });

  describe("Handlers", () => {
    test("handleDateChange updates date", () => {
      const { result } = renderHook(() =>
        useLabReservationState({
          selectedLab: mockLab,
          labBookings: [],
          isSSO: false,
        })
      );

      const newDate = new Date("2025-06-15");

      act(() => {
        result.current.handleDateChange(newDate);
      });

      expect(result.current.date).toBe(newDate);
    });

    test("handleDurationChange updates duration", () => {
      const { result } = renderHook(() =>
        useLabReservationState({
          selectedLab: mockLab,
          labBookings: [],
          isSSO: false,
        })
      );

      act(() => {
        result.current.handleDurationChange(60);
      });

      expect(result.current.duration).toBe(60);
    });

    test("handleTimeChange updates selected time", () => {
      generateTimeOptions.mockReturnValue([
        { value: "09:00", label: "09:00 AM", disabled: false },
        { value: "14:00", label: "02:00 PM", disabled: false },
      ]);

      const { result } = renderHook(() =>
        useLabReservationState({
          selectedLab: mockLab,
          labBookings: [],
          isSSO: false,
        })
      );

      act(() => {
        result.current.handleTimeChange("14:00");
      });

      expect(result.current.selectedTime).toBe("14:00");
    });
  });

  describe("Optimistic Updates", () => {
    test("removes optimistic booking when real booking appears with matching timestamp", async () => {
      const optimisticData = {
        optimisticId: "opt-123",
        labId: "lab-1",
        start: "1704110400",
      };

      const { result, rerender } = renderHook(
        ({ bookings }) =>
          useLabReservationState({
            selectedLab: mockLab,
            labBookings: bookings,
            isSSO: false,
          }),
        { initialProps: { bookings: [] } }
      );

      act(() => {
        result.current.setPendingData(optimisticData);
      });

      const realBooking = {
        labId: "lab-1",
        start: "1704110430",
        isOptimistic: false,
        reservationKey: "real-key-456",
      };

      rerender({ bookings: [realBooking] });

      await waitFor(() => {
        expect(mockCacheUpdates.removeOptimisticBooking).toHaveBeenCalledWith(
          "opt-123"
        );
      });
    });
  });

  describe("Edge Cases", () => {
    test("handles null labBookings gracefully", () => {
      const { result } = renderHook(() =>
        useLabReservationState({
          selectedLab: mockLab,
          labBookings: null,
          isSSO: false,
        })
      );

      expect(result.current.availableTimes).toBeDefined();
      expect(generateTimeOptions).toHaveBeenCalledWith(
        expect.objectContaining({ bookingInfo: [] })
      );
    });

    test("handles undefined labBookings gracefully", () => {
      const { result } = renderHook(() =>
        useLabReservationState({
          selectedLab: mockLab,
          labBookings: undefined,
          isSSO: false,
        })
      );

      expect(result.current.availableTimes).toBeDefined();
    });

    test("handles lab without opens/closes dates", () => {
      const labNoDates = { ...mockLab, opens: null, closes: null };

      const { result } = renderHook(() =>
        useLabReservationState({
          selectedLab: labNoDates,
          labBookings: [],
          isSSO: false,
        })
      );

      expect(result.current.minDate).toBeInstanceOf(Date);
    });
  });
});
