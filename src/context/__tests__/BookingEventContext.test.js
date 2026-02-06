import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BookingEventProvider,
  useBookingEventContext,
} from "../BookingEventContext";
import { bookingQueryKeys } from "@/utils/hooks/queryKeys";
import * as wagmiHooks from "wagmi";
import * as userContext from "@/context/UserContext";
import * as notificationContext from "@/context/NotificationContext";

// Mock external dependencies
jest.mock("wagmi", () => ({
  useWatchContractEvent: jest.fn(),
  useConnection: jest.fn(),
}));

jest.mock("@/context/UserContext", () => ({
  useUser: jest.fn(),
}));

jest.mock("@/context/NotificationContext", () => ({
  useNotifications: jest.fn(),
}));

jest.mock("@/contracts/diamond", () => ({
  contractABI: [],
  contractAddresses: {
    sepolia: "0xContractAddress",
    localhost: "0xLocalContractAddress",
  },
}));

jest.mock("@/utils/blockchain/selectChain", () => ({
  selectChain: jest.fn((chain) => ({
    id: chain?.id || 11155111,
    name: chain?.name || "sepolia",
  })),
}));

jest.mock('@/utils/dev/logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock optimistic UI clear helper so we can assert clears on events
const mockClearOptimisticBookingState = jest.fn();
jest.mock('@/context/OptimisticUIContext', () => ({
  useOptimisticUI: () => ({
    clearOptimisticBookingState: mockClearOptimisticBookingState,
  }),
}));

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const createWrapper = (queryClient) => ({ children }) => (
  <QueryClientProvider client={queryClient}>
    <BookingEventProvider>{children}</BookingEventProvider>
  </QueryClientProvider>
);

describe("BookingEventContext", () => {
  let eventCallbacks = {};
  const mockUseConnection = {
    accounts: ["0xUserAddress"],
    chain: { id: 11155111, name: "sepolia" },
    status: 'connected',
  };
  const mockUseUser = {
    address: "0xUserAddress",
    isSSO: true,
  };
  const mockAddTemporaryNotification = jest.fn();
  const originalFetch = global.fetch;

  const reservationRequestedLog = (overrides = {}) => ({
    args: {
      reservationKey: overrides.reservationKey || "reservation-123",
      renter: overrides.renter || "0xUserAddress",
      tokenId: overrides.tokenId || "1",
      start: overrides.start || BigInt(Math.floor(Date.now() / 1000) + 3600),
      end:
        overrides.end || BigInt(Math.floor(Date.now() / 1000) + 7200),
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    eventCallbacks = {};
    jest.spyOn(Date, "now").mockReturnValue(1700000000000);
    process.env.NEXT_PUBLIC_BOOKING_BACKUP_POLLING_ENABLED = "false";

    wagmiHooks.useConnection.mockReturnValue(mockUseConnection);
    userContext.useUser.mockReturnValue(mockUseUser);
    notificationContext.useNotifications.mockReturnValue({
      addTemporaryNotification: mockAddTemporaryNotification,
    });

    wagmiHooks.useWatchContractEvent.mockImplementation(
      ({ eventName, onLogs }) => {
        eventCallbacks[eventName] = onLogs;
        return undefined;
      }
    );

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ reservation: { status: 1, renter: "0xUserAddress" } }),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    global.fetch = originalFetch;
    delete process.env.NEXT_PUBLIC_BOOKING_BACKUP_POLLING_ENABLED;
  });

  const triggerEvent = async (eventName, logs) => {
    await act(async () => {
      await eventCallbacks[eventName]?.(logs);
    });
  };

  test("provides context value to children", () => {
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useBookingEventContext(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current).toEqual(
      expect.objectContaining({
        registerPendingConfirmation: expect.any(Function),
      })
    );
  });

  test("throws error when hook used outside provider", () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    expect(() => renderHook(() => useBookingEventContext())).toThrow(
      "useBookingEventContext must be used within a BookingEventProvider"
    );

    consoleErrorSpy.mockRestore();
  });

  test("registers all booking-related event listeners", () => {
    const queryClient = createTestQueryClient();
    renderHook(() => useBookingEventContext(), {
      wrapper: createWrapper(queryClient),
    });

    expect(wagmiHooks.useWatchContractEvent).toHaveBeenCalledTimes(5);
    expect(eventCallbacks).toHaveProperty("ReservationRequested");
    expect(eventCallbacks).toHaveProperty("ReservationConfirmed");
    expect(eventCallbacks).toHaveProperty("BookingCanceled");
    expect(eventCallbacks).toHaveProperty("ReservationRequestCanceled");
    expect(eventCallbacks).toHaveProperty("ReservationRequestDenied");
  });

  test("notifies the requester when a tracked reservation is confirmed", async () => {
    const queryClient = createTestQueryClient();
    renderHook(() => useBookingEventContext(), {
      wrapper: createWrapper(queryClient),
    });

    await triggerEvent("ReservationRequested", [reservationRequestedLog()]);
    await triggerEvent("ReservationConfirmed", [
      { args: { reservationKey: "reservation-123", tokenId: "1" } },
    ]);

    await waitFor(() => {
      expect(mockAddTemporaryNotification).toHaveBeenCalledWith(
        "success",
        "✅ Reservation confirmed!",
        null,
        expect.objectContaining({
          dedupeKey: "reservation-confirmed:reservation-123",
          dedupeWindowMs: 120000,
        })
      );
    });

    // Should clear optimistic booking state for this reservation
    expect(mockClearOptimisticBookingState).toHaveBeenCalledWith("reservation-123");

    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("notifies the requester when the provider denies the reservation", async () => {
    const queryClient = createTestQueryClient();
    renderHook(() => useBookingEventContext(), {
      wrapper: createWrapper(queryClient),
    });

    await triggerEvent("ReservationRequested", [reservationRequestedLog()]);
    await triggerEvent("ReservationRequestDenied", [
      { args: { reservationKey: "reservation-123", tokenId: "1" } },
    ]);

    await waitFor(() => {
      expect(mockAddTemporaryNotification).toHaveBeenCalledWith(
        "error",
        "❌ Reservation denied by the provider.",
        null,
        expect.objectContaining({
          dedupeKey: "reservation-denied:reservation-123",
          dedupeWindowMs: 120000,
        })
      );
    });

    // Should clear optimistic booking state for this reservation
    expect(mockClearOptimisticBookingState).toHaveBeenCalledWith("reservation-123");
  });

  test("requires reservation ownership before showing confirmation notification", async () => {
    const queryClient = createTestQueryClient();
    renderHook(() => useBookingEventContext(), {
      wrapper: createWrapper(queryClient),
    });

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        reservation: { status: 1, renter: "0xAnotherUser" },
      }),
    });

    await triggerEvent("ReservationConfirmed", [
      { args: { reservationKey: "reservation-456", tokenId: "3" } },
    ]);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(mockAddTemporaryNotification).not.toHaveBeenCalled();
  });

  test("invalidates reservation-related caches on confirmation", async () => {
    const queryClient = createTestQueryClient();
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");

    renderHook(() => useBookingEventContext(), {
      wrapper: createWrapper(queryClient),
    });

    await triggerEvent("ReservationConfirmed", [
      { args: { reservationKey: "reservation-999", tokenId: "7" } },
    ]);

    // Ensure optimistic booking state was cleared
    expect(mockClearOptimisticBookingState).toHaveBeenCalledWith("reservation-999");

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: bookingQueryKeys.byReservationKey("reservation-999"),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: bookingQueryKeys.getReservationsOfToken("7"),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: bookingQueryKeys.reservationsOf(mockUseConnection.accounts[0]),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: bookingQueryKeys.hasActiveBooking("reservation-999", mockUseConnection.accounts[0]),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: bookingQueryKeys.hasActiveBookingByToken("7", mockUseConnection.accounts[0]),
      });
    });
  });

  test("clears optimistic state on BookingCanceled", async () => {
    const queryClient = createTestQueryClient();
    renderHook(() => useBookingEventContext(), { wrapper: createWrapper(queryClient) });

    await triggerEvent("BookingCanceled", [
      { args: { reservationKey: "res-cancel-1", tokenId: "3" } },
    ]);

    expect(mockClearOptimisticBookingState).toHaveBeenCalledWith("res-cancel-1");
  });

  test("backup polling resolves confirmations when events are missed", async () => {
    jest.useFakeTimers();
    process.env.NEXT_PUBLIC_BOOKING_BACKUP_POLLING_ENABLED = "true";
    const queryClient = createTestQueryClient();
    renderHook(() => useBookingEventContext(), {
      wrapper: createWrapper(queryClient),
    });

    const pollingResponse = {
      ok: true,
      json: async () => ({
        reservation: { status: 1, renter: "0xUserAddress" },
      }),
    };

    global.fetch.mockResolvedValue(pollingResponse);

    await triggerEvent("ReservationRequested", [reservationRequestedLog()]);

    await act(async () => {
      jest.advanceTimersByTime(10000);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockAddTemporaryNotification).toHaveBeenCalledWith(
        "success",
        "✅ Reservation confirmed!",
        null,
        expect.objectContaining({
          dedupeKey: "reservation-confirmed:reservation-123",
          dedupeWindowMs: 120000,
        })
      );
    });
  });

  test("does not emit duplicate confirmation toast when polling and event both resolve", async () => {
    jest.useFakeTimers();
    process.env.NEXT_PUBLIC_BOOKING_BACKUP_POLLING_ENABLED = "true";

    const queryClient = createTestQueryClient();
    renderHook(() => useBookingEventContext(), {
      wrapper: createWrapper(queryClient),
    });

    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        reservation: { status: 1, renter: "0xUserAddress" },
      }),
    });

    await triggerEvent("ReservationRequested", [reservationRequestedLog()]);

    // First confirmation source: backup polling
    await act(async () => {
      jest.advanceTimersByTime(10000);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockAddTemporaryNotification).toHaveBeenCalledTimes(1);
    });

    // Second confirmation source: chain event
    await triggerEvent("ReservationConfirmed", [
      { args: { reservationKey: "reservation-123", tokenId: "1" } },
    ]);

    await waitFor(() => {
      expect(mockAddTemporaryNotification).toHaveBeenCalledTimes(1);
      expect(mockAddTemporaryNotification).toHaveBeenNthCalledWith(
        1,
        "success",
        expect.stringContaining("Reservation confirmed"),
        null,
        expect.objectContaining({
          dedupeKey: "reservation-confirmed:reservation-123",
          dedupeWindowMs: 120000,
        })
      );
    });
  });

  test("cleans pending confirmations on denial", async () => {
    const deleteSpy = jest.spyOn(Map.prototype, "delete");
    const queryClient = createTestQueryClient();

    renderHook(() => useBookingEventContext(), {
      wrapper: createWrapper(queryClient),
    });

    await triggerEvent("ReservationRequested", [reservationRequestedLog()]);
    await triggerEvent("ReservationRequestDenied", [
      { args: { reservationKey: "reservation-123", tokenId: "1" } },
    ]);

    expect(deleteSpy).toHaveBeenCalledWith("reservation-123");

    deleteSpy.mockRestore();
  });
});

