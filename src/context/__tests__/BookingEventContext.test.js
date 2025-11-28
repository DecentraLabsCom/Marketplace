import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BookingEventProvider,
  useBookingEventContext,
} from "../BookingEventContext";
import * as wagmiHooks from "wagmi";
import * as userContext from "@/context/UserContext";
import * as notificationContext from "@/context/NotificationContext";

// Mock external dependencies
jest.mock("wagmi", () => ({
  useWatchContractEvent: jest.fn(),
  useAccount: jest.fn(),
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

jest.mock("@/utils/dev/logger", () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
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
  const mockUseAccount = {
    chain: { id: 11155111, name: "sepolia" },
    address: "0xUserAddress",
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

    wagmiHooks.useAccount.mockReturnValue(mockUseAccount);
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

    expect(result.current).toEqual({});
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
        "✅ Reservation confirmed!"
      );
    });

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
        "❌ Reservation denied by the provider."
      );
    });
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

  test("backup polling resolves confirmations when events are missed", async () => {
    jest.useFakeTimers();
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
        "✅ Reservation confirmed!"
      );
    });
  });
});
