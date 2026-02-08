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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import { selectChain } from "@/utils/blockchain/selectChain";

// Mock external contexts to control their behavior and responses
jest.mock("@/context/NotificationContext");
jest.mock("@/context/LabTokenContext");
jest.mock("@/hooks/booking/useBookings");
jest.mock("@/utils/blockchain/selectChain");

// Mock blockchain/WAGMI hooks to simulate web3 interactions without real connections
jest.mock("wagmi");

// Mock utility functions to test specific scenarios and edge cases
jest.mock("@/utils/booking/bookingStatus", () => ({
  isCancelledBooking: jest.fn(),
  BOOKING_STATE: {
    REQUESTED: "requested",
    PENDING: "pending",
    CONFIRMED: "confirmed",
    IN_USE: "in_use",
    COMPLETED: "completed",
    COLLECTED: "collected",
    CANCELLED: "cancelled",
  },
  normalizeBookingStatusState: jest.fn((booking) => {
    const status = booking?.status;
    if (status === 0 || status === "0" || status === "pending" || status === "requested") return "pending";
    if (status === 1 || status === "1" || status === "confirmed") return "confirmed";
    if (status === 2 || status === "2" || status === "in_use") return "in_use";
    if (status === 3 || status === "3" || status === "completed") return "completed";
    if (status === 4 || status === "4" || status === "collected") return "collected";
    if (status === 5 || status === "5" || status === "cancelled" || status === "canceled") return "cancelled";
    return null;
  }),
  BOOKING_STATUS: {
    PENDING: 0,
    CONFIRMED: 1,
    IN_USE: 2,
    COMPLETED: 3,
    COLLECTED: 4,
    CANCELLED: 5,
  },
}));
jest.mock("@/utils/booking/labBookingCalendar");

// Mock development logger to prevent console noise during test execution
jest.mock("@/utils/dev/logger");

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const Wrapper = ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return Wrapper;
};

const renderHookWithClient = (callback, options = {}) =>
  renderHook(callback, { wrapper: createWrapper(), ...options });

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
    selectChain.mockReturnValue({ id: 11155111, name: "sepolia" });

    jest.spyOn(wagmi, "useConnection").mockReturnValue({
      accounts: ['0x123'],
      chain: { id: 11155111, name: "sepolia" },
      status: 'connected',
    });

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
      const { result } = renderHookWithClient(() =>
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
      const { result } = renderHookWithClient(() =>
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

      const { result } = renderHookWithClient(() =>
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

      const { result } = renderHookWithClient(() =>
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

      const { result } = renderHookWithClient(() =>
        useLabReservationState({
          selectedLab: futureLab,
          labBookings: [],
          isSSO: false,
        })
      );

      expect(result.current.minDate.getDate()).toBe(futureDate.getDate());
    });

    test("sets maxDate from lab closes date", () => {
      const { result } = renderHookWithClient(() =>
        useLabReservationState({
          selectedLab: mockLab,
          labBookings: [],
          isSSO: false,
        })
      );

      expect(result.current.maxDate).toBeInstanceOf(Date);
      expect(result.current.maxDate.getFullYear()).toBe(2025);
    });

    test("keeps UTC opens date aligned (no local-day drift)", () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);
      const utcOpenSeconds = Math.floor(Date.UTC(
        futureDate.getUTCFullYear(),
        futureDate.getUTCMonth(),
        futureDate.getUTCDate()
      ) / 1000);
      const labUtc = { ...mockLab, opens: utcOpenSeconds, closes: utcOpenSeconds + 86400 };

      const { result } = renderHookWithClient(() =>
        useLabReservationState({
          selectedLab: labUtc,
          labBookings: [],
          isSSO: false,
        })
      );

      const minIso = result.current.minDate.toISOString().slice(0, 10);
      const expectedIso = new Date(utcOpenSeconds * 1000).toISOString().slice(0, 10);

      expect(minIso).toBe(expectedIso);
      expect(result.current.maxDate?.toISOString().slice(0, 10)).toBe(
        new Date((utcOpenSeconds + 86400) * 1000).toISOString().slice(0, 10)
      );
    });

    test("handles invalid opens date gracefully", () => {
      const invalidLab = { ...mockLab, opens: "invalid-date" };

      const { result } = renderHookWithClient(() =>
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
      const { result } = renderHookWithClient(() =>
        useLabReservationState({
          selectedLab: mockLab,
          labBookings: mockBookings,
          isSSO: false,
        })
      );

      expect(generateTimeOptions).toHaveBeenCalledWith({
        date: expect.any(Date),
        interval: 15,
        lab: mockLab,
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

      renderHookWithClient(() =>
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
      const { result } = renderHookWithClient(() =>
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
      const { result } = renderHookWithClient(() =>
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
      const { result } = renderHookWithClient(() =>
        useLabReservationState({
          selectedLab: null,
          labBookings: [],
          isSSO: false,
        })
      );

      expect(result.current.totalCost).toBe(0n);
    });

    test("recalculates cost when duration changes", () => {
      const { result } = renderHookWithClient(() =>
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
      const { result } = renderHookWithClient(() =>
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

      const { result } = renderHookWithClient(() =>
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
      const { result } = renderHookWithClient(() =>
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
      const { result } = renderHookWithClient(() =>
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

      const { result } = renderHookWithClient(() =>
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
        isOptimistic: true,
      };

      const { result, rerender } = renderHookWithClient(
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

  describe("Calendar Pending Merge", () => {
    test("merges wallet pending booking into calendar data without duplicates", () => {
      const pendingRequest = {
        reservationKey: "wallet-res-42",
        labId: "lab-1",
        start: "1704110400",
        end: "1704114000",
      };

      const trackedPendingBooking = {
        reservationKey: "wallet-res-42",
        labId: "lab-1",
        start: "1704110400",
        end: "1704114000",
        status: 0,
      };

      const { result, rerender } = renderHookWithClient(
        ({ bookings }) =>
          useLabReservationState({
            selectedLab: mockLab,
            labBookings: bookings,
            userBookingsForLab: [],
            isSSO: false,
          }),
        { initialProps: { bookings: [] } }
      );

      act(() => {
        result.current.startWalletProcessing();
        result.current.markWalletRequestSent(pendingRequest);
        result.current.setPendingData({
          optimisticId: "optimistic-wallet-42",
          isOptimistic: true,
          ...pendingRequest,
        });
      });

      rerender({ bookings: [trackedPendingBooking] });
      expect(result.current.walletBookingStage).toBe("request_registered");
      expect(result.current.calendarUserBookingsForLab).toHaveLength(1);
      expect(result.current.calendarUserBookingsForLab[0]).toEqual(
        expect.objectContaining({
          reservationKey: "wallet-res-42",
          labId: "lab-1",
          start: "1704110400",
        })
      );

      // If tracked booking disappears temporarily, synthetic fallback remains single-entry.
      rerender({ bookings: [] });
      expect(result.current.walletBookingStage).toBe("request_registered");
      expect(result.current.calendarUserBookingsForLab).toHaveLength(1);
      expect(result.current.calendarUserBookingsForLab[0]).toEqual(
        expect.objectContaining({
          reservationKey: "wallet-res-42",
          labId: "lab-1",
          start: 1704110400,
          status: 0,
          isPending: true,
          isOptimistic: true,
        })
      );
    });

    test("keeps a single official booking when official and synthetic pending match", async () => {
      const pendingRequest = {
        reservationKey: "wallet-res-43",
        labId: "lab-1",
        start: "1704110500",
        end: "1704114100",
      };

      const officialBooking = {
        reservationKey: "wallet-res-43",
        labId: "lab-1",
        start: "1704110500",
        end: "1704114100",
        status: 0,
        isOptimistic: false,
      };

      const { result } = renderHookWithClient(() =>
        useLabReservationState({
          selectedLab: mockLab,
          labBookings: [],
          userBookingsForLab: [officialBooking],
          isSSO: false,
        })
      );

      act(() => {
        result.current.startWalletProcessing();
        result.current.markWalletRequestSent(pendingRequest);
        result.current.setPendingData({
          optimisticId: "optimistic-wallet-43",
          isOptimistic: true,
          ...pendingRequest,
        });
      });

      await waitFor(() => {
        expect(result.current.walletBookingStage).toBe("request_registered");
      });

      expect(result.current.calendarUserBookingsForLab).toHaveLength(1);
      expect(result.current.calendarUserBookingsForLab[0]).toEqual(
        expect.objectContaining({
          reservationKey: "wallet-res-43",
          labId: "lab-1",
          start: "1704110500",
          isOptimistic: false,
        })
      );
    });
  });

  describe("SSO Request Registered Toast Fallback", () => {
    test("emits fallback toast once when request reaches request_registered without on-chain event", () => {
      jest.useFakeTimers();

      const pendingRequest = {
        reservationKey: "sso-res-100",
        labId: "lab-1",
        start: "1704110400",
      };

      const { result, rerender } = renderHookWithClient(
        ({ userBookings }) =>
          useLabReservationState({
            selectedLab: mockLab,
            labBookings: [],
            userBookingsForLab: userBookings,
            isSSO: true,
          }),
        { initialProps: { userBookings: [] } }
      );

      act(() => {
        result.current.startSsoProcessing();
        result.current.markSsoRequestSent(pendingRequest);
      });

      rerender({
        userBookings: [
          {
            reservationKey: "sso-res-100",
            labId: "lab-1",
            start: "1704110400",
            status: 0,
          },
        ],
      });

      expect(result.current.ssoBookingStage).toBe("request_registered");

      act(() => {
        jest.advanceTimersByTime(1500);
      });

      expect(mockNotifications.addTemporaryNotification).toHaveBeenCalledWith(
        "pending",
        "Reservation request accepted. Waiting for on-chain registration...",
        null,
        expect.objectContaining({
          dedupeKey: "reservation-onchain-pending:sso-res-100",
        })
      );

      act(() => {
        result.current.markSsoRequestSent(pendingRequest);
      });
      rerender({
        userBookings: [
          {
            reservationKey: "sso-res-100",
            labId: "lab-1",
            start: "1704110400",
            status: 0,
          },
        ],
      });
      act(() => {
        jest.advanceTimersByTime(1500);
      });

      const fallbackCalls = mockNotifications.addTemporaryNotification.mock.calls.filter(
        (call) =>
          call?.[0] === "pending" &&
          String(call?.[1] || "").includes("Waiting for on-chain registration")
      );
      expect(fallbackCalls).toHaveLength(1);
    });

    test("does not emit fallback toast when on-chain requested signal arrives first", () => {
      jest.useFakeTimers();

      const pendingRequest = {
        reservationKey: "sso-res-200",
        labId: "lab-1",
        start: "1704110400",
      };

      const { result, rerender } = renderHookWithClient(
        ({ userBookings }) =>
          useLabReservationState({
            selectedLab: mockLab,
            labBookings: [],
            userBookingsForLab: userBookings,
            isSSO: true,
          }),
        { initialProps: { userBookings: [] } }
      );

      act(() => {
        result.current.startSsoProcessing();
        result.current.markSsoRequestSent(pendingRequest);
      });

      rerender({
        userBookings: [
          {
            reservationKey: "sso-res-200",
            labId: "lab-1",
            start: "1704110400",
            status: 0,
          },
        ],
      });
      expect(result.current.ssoBookingStage).toBe("request_registered");

      act(() => {
        window.dispatchEvent(
          new CustomEvent("reservation-requested-onchain", {
            detail: { reservationKey: "sso-res-200", tokenId: "1" },
          })
        );
      });

      act(() => {
        jest.advanceTimersByTime(1500);
      });

      const fallbackCalls = mockNotifications.addTemporaryNotification.mock.calls.filter(
        (call) =>
          call?.[0] === "pending" &&
          String(call?.[1] || "").includes("Waiting for on-chain registration")
      );
      expect(fallbackCalls).toHaveLength(0);
    });
  });

  describe("Edge Cases", () => {
    test("handles null labBookings gracefully", () => {
      const { result } = renderHookWithClient(() =>
        useLabReservationState({
          selectedLab: mockLab,
          labBookings: null,
          isSSO: false,
        })
      );

      expect(result.current.availableTimes).toBeDefined();
      expect(generateTimeOptions).toHaveBeenCalledWith(
        expect.objectContaining({ bookingInfo: [], lab: mockLab })
      );
    });

    test("handles undefined labBookings gracefully", () => {
      const { result } = renderHookWithClient(() =>
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

      const { result } = renderHookWithClient(() =>
        useLabReservationState({
          selectedLab: labNoDates,
          labBookings: [],
          isSSO: false,
        })
      );

      expect(result.current.minDate).toBeInstanceOf(Date);
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });
});
