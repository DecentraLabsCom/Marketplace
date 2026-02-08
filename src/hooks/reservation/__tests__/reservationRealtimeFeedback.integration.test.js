import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLabReservationState } from "../useLabReservationState";
import { BookingEventProvider } from "@/context/BookingEventContext";
import { mapBookingsForCalendar } from "@/utils/booking/calendarBooking";
import { useBookingFilter } from "@/hooks/booking/useBookingFilter";
import { parseDateSafe } from "@/utils/dates/parseDateSafe";
import * as wagmi from "wagmi";
import { useNotifications } from "@/context/NotificationContext";
import { useUser } from "@/context/UserContext";
import { useLabToken } from "@/context/LabTokenContext";
import {
  useReservationRequest,
  useBookingCacheUpdates as useBookingCacheUpdatesFromBookings,
} from "@/hooks/booking/useBookings";
import { useBookingCacheUpdates as useBookingCacheUpdatesStandalone } from "@/hooks/booking/useBookingCacheUpdates";

jest.mock("wagmi", () => ({
  useWatchContractEvent: jest.fn(),
  useConnection: jest.fn(),
  useWaitForTransactionReceipt: jest.fn(),
}));

jest.mock("@/context/NotificationContext", () => ({
  useNotifications: jest.fn(),
}));

jest.mock("@/context/UserContext", () => ({
  useUser: jest.fn(),
}));

jest.mock("@/context/LabTokenContext", () => ({
  useLabToken: jest.fn(),
}));

jest.mock("@/hooks/booking/useBookings", () => ({
  useReservationRequest: jest.fn(),
  useBookingCacheUpdates: jest.fn(),
}));

jest.mock("@/hooks/booking/useBookingCacheUpdates", () => ({
  useBookingCacheUpdates: jest.fn(),
}));

jest.mock("@/context/OptimisticUIContext", () => ({
  useOptimisticUI: () => ({
    clearOptimisticBookingState: jest.fn(),
  }),
}));

jest.mock("@/utils/dev/logger", () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe("Reservation realtime feedback integration", () => {
  const mockAddTemporaryNotification = jest.fn();
  const mockAddErrorNotification = jest.fn();
  const reservationEventCallbacks = {};

  const selectedLab = {
    id: "1",
    name: "AI Lab",
    price: 100,
    timeSlots: [15, 30, 60],
    opens: 1735689600,
    closes: 1767139200,
  };

  const createWrapper = () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    return ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <BookingEventProvider>{children}</BookingEventProvider>
      </QueryClientProvider>
    );
  };

  const useReservationCalendarHarness = ({
    isSSO = false,
    userBookingsForLab = [],
    labBookings = [],
  } = {}) => {
    const reservationState = useLabReservationState({
      selectedLab,
      labBookings,
      userBookingsForLab,
      isSSO,
    });

    const calendarBookings = mapBookingsForCalendar(
      reservationState.calendarUserBookingsForLab,
      { labName: selectedLab.name }
    );

    const { dayClassName } = useBookingFilter(
      calendarBookings,
      "lab-reservation"
    );

    return {
      reservationState,
      calendarBookings,
      dayClassName,
    };
  };

  const triggerReservationRequested = async ({
    reservationKey,
    renter = "0xUserAddress",
    tokenId = "1",
    start = Math.floor(Date.now() / 1000) + 86400,
    end = Math.floor(Date.now() / 1000) + 90000,
  }) => {
    await act(async () => {
      await reservationEventCallbacks.ReservationRequested?.([
        {
          args: {
            reservationKey,
            renter,
            tokenId,
            start: BigInt(start),
            end: BigInt(end),
          },
        },
      ]);
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(reservationEventCallbacks).forEach((key) => {
      delete reservationEventCallbacks[key];
    });

    wagmi.useConnection.mockReturnValue({
      accounts: ["0xUserAddress"],
      chain: { id: 11155111, name: "sepolia" },
      status: "connected",
    });

    wagmi.useWaitForTransactionReceipt.mockReturnValue({
      data: null,
      isLoading: false,
      isSuccess: false,
      isError: false,
      error: null,
    });

    wagmi.useWatchContractEvent.mockImplementation(({ eventName, onLogs }) => {
      reservationEventCallbacks[eventName] = onLogs;
    });

    useNotifications.mockReturnValue({
      addTemporaryNotification: mockAddTemporaryNotification,
      addErrorNotification: mockAddErrorNotification,
    });

    useUser.mockReturnValue({
      address: "0xUserAddress",
      isSSO: false,
    });

    useLabToken.mockReturnValue({
      calculateReservationCost: jest.fn(() => 1500n),
      formatPrice: jest.fn((value) => String(value)),
      refreshTokenData: jest.fn(),
    });

    useReservationRequest.mockReturnValue({
      mutateAsync: jest.fn(),
      mutate: jest.fn(),
      isLoading: false,
    });

    useBookingCacheUpdatesFromBookings.mockReturnValue({
      removeOptimisticBooking: jest.fn(),
      replaceOptimisticBooking: jest.fn(),
    });

    useBookingCacheUpdatesStandalone.mockReturnValue({
      removeOptimisticBooking: jest.fn(),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("wallet request_registered shows pending calendar state and on-chain toast without refetch wait", async () => {
    const futureStart = Math.floor(Date.now() / 1000) + 86400;
    const futureEnd = futureStart + 3600;

    const { result, rerender } = renderHook(
      ({ userBookingsForLab, labBookings }) =>
        useReservationCalendarHarness({
          isSSO: false,
          userBookingsForLab,
          labBookings,
        }),
      {
        initialProps: { userBookingsForLab: [], labBookings: [] },
        wrapper: createWrapper(),
      }
    );

    act(() => {
      result.current.reservationState.startWalletProcessing();
      result.current.reservationState.markWalletRequestSent({
        reservationKey: "wallet-live-1",
        labId: "1",
        start: String(futureStart),
        end: String(futureEnd),
      });
    });

    rerender({
      userBookingsForLab: [],
      labBookings: [
        {
          reservationKey: "wallet-live-1",
          labId: "1",
          start: String(futureStart),
          end: String(futureEnd),
          status: 0,
        },
      ],
    });

    await waitFor(() => {
      expect(result.current.reservationState.walletBookingStage).toBe(
        "request_registered"
      );
    });

    await waitFor(() => {
      expect(result.current.calendarBookings.length).toBeGreaterThan(0);
    });
    const requestedDay = parseDateSafe(result.current.calendarBookings[0]?.date);
    expect(result.current.dayClassName(requestedDay)).toContain(
      "pending-booking"
    );

    await triggerReservationRequested({
      reservationKey: "wallet-live-1",
      start: futureStart,
      end: futureEnd,
    });

    expect(mockAddTemporaryNotification).toHaveBeenCalledWith(
      "success",
      expect.stringContaining("Reservation request registered on-chain"),
      null,
      expect.objectContaining({
        dedupeKey: "reservation-onchain-requested:wallet-live-1",
      })
    );

    expect(result.current.dayClassName(requestedDay)).toContain(
      "pending-booking"
    );
  });

  test("SSO fallback toast is followed by final on-chain toast when event arrives", async () => {
    jest.useFakeTimers();
    useUser.mockReturnValue({
      address: "0xUserAddress",
      isSSO: true,
    });
    const futureStart = Math.floor(Date.now() / 1000) + 86400;
    const futureEnd = futureStart + 3600;

    const { result, rerender } = renderHook(
      ({ userBookingsForLab, labBookings }) =>
        useReservationCalendarHarness({
          isSSO: true,
          userBookingsForLab,
          labBookings,
        }),
      {
        initialProps: { userBookingsForLab: [], labBookings: [] },
        wrapper: createWrapper(),
      }
    );

    act(() => {
      result.current.reservationState.startSsoProcessing();
      result.current.reservationState.markSsoRequestSent({
        reservationKey: "sso-live-1",
        labId: "1",
        start: String(futureStart),
        end: String(futureEnd),
      });
    });

    rerender({
      userBookingsForLab: [
        {
          reservationKey: "sso-live-1",
          labId: "1",
          start: String(futureStart),
          end: String(futureEnd),
          status: 0,
        },
      ],
      labBookings: [],
    });

    await waitFor(() => {
      expect(result.current.reservationState.ssoBookingStage).toBe(
        "request_registered"
      );
    });

    act(() => {
      jest.advanceTimersByTime(1500);
    });

    expect(mockAddTemporaryNotification).toHaveBeenCalledWith(
      "pending",
      "Reservation request accepted. Waiting for on-chain registration...",
      null,
      expect.objectContaining({
        dedupeKey: "reservation-onchain-pending:sso-live-1",
      })
    );

    await triggerReservationRequested({
      reservationKey: "sso-live-1",
      start: futureStart,
      end: futureEnd,
    });

    const pendingCalls = mockAddTemporaryNotification.mock.calls.filter(
      (call) =>
        call?.[0] === "pending" &&
        String(call?.[1] || "").includes("Waiting for on-chain registration")
    );
    const successCalls = mockAddTemporaryNotification.mock.calls.filter(
      (call) =>
        call?.[0] === "success" &&
        String(call?.[1] || "").includes("registered on-chain")
    );

    expect(pendingCalls).toHaveLength(1);
    expect(successCalls).toHaveLength(1);
    expect(successCalls[0][3]).toEqual(
      expect.objectContaining({
        dedupeKey: "reservation-onchain-requested:sso-live-1",
      })
    );
  });
});
