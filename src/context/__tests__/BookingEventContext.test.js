/**
 * Unit Tests for BookingEventContext
 *
 * Tests blockchain event handling context including reservation request/confirmation,
 * cancellations, denials, cache management, and auto-confirmation logic.
 *
 * Tests Behaviors:
 * - Context initialization and provider/hook integration
 * - Event listeners setup (5 different blockchain events)
 * - Auto-confirmation flow with deduplication
 * - Time validation for reservations
 * - User-specific notifications
 * - Cache invalidation and refetch strategies
 * - Error handling and recovery
 * - Cleanup mechanisms for refs
 * - Edge cases (duplicate events, stale processing, invalid data)
 */

import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BookingEventProvider,
  useBookingEventContext,
} from "../BookingEventContext";
import * as wagmiHooks from "wagmi";
import * as bookingHooks from "@/hooks/booking/useBookings";
import * as userContext from "@/context/UserContext";
import * as notificationContext from "@/context/NotificationContext";
import { bookingQueryKeys } from "@/utils/hooks/queryKeys";

// Mock external dependencies
jest.mock("wagmi", () => ({
  useWatchContractEvent: jest.fn(),
  useAccount: jest.fn(),
}));

jest.mock("@/hooks/booking/useBookings", () => ({
  useConfirmReservationRequest: jest.fn(),
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

// Helper to create fresh QueryClient
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

// Helper to create wrapper with providers
const createWrapper = (queryClient) => {
  return ({ children }) => (
    <QueryClientProvider client={queryClient}>
      <BookingEventProvider>{children}</BookingEventProvider>
    </QueryClientProvider>
  );
};

describe("BookingEventContext", () => {
  // Mock implementations storage
  let eventCallbacks = {};

  // Default mock values
  const mockUseAccount = {
    chain: { id: 11155111, name: "sepolia" },
    address: "0xUserAddress",
  };

  const mockUseUser = {
    address: "0xUserAddress",
    isSSO: true,
  };

  const mockAddTemporaryNotification = jest.fn();

  const mockConfirmReservationMutation = {
    mutateAsync: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    eventCallbacks = {};

    // Mock Date.now for consistent timestamps
    jest.spyOn(Date, "now").mockReturnValue(1700000000000); // Nov 2023

    // Setup default mocks
    wagmiHooks.useAccount.mockReturnValue(mockUseAccount);
    userContext.useUser.mockReturnValue(mockUseUser);
    notificationContext.useNotifications.mockReturnValue({
      addTemporaryNotification: mockAddTemporaryNotification,
    });
    bookingHooks.useConfirmReservationRequest.mockReturnValue(
      mockConfirmReservationMutation
    );

    // Mock useWatchContractEvent to capture callbacks
    wagmiHooks.useWatchContractEvent.mockImplementation(
      ({ eventName, onLogs }) => {
        eventCallbacks[eventName] = onLogs;
        return undefined;
      }
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("Context Initialization", () => {
    test("provides context value to children", () => {
      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useBookingEventContext(), {
        wrapper: createWrapper(queryClient),
      });

      expect(result.current).toBeDefined();
      expect(result.current).toEqual({});
    });

    test("throws error when useBookingEventContext is called outside provider", () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      expect(() => {
        renderHook(() => useBookingEventContext());
      }).toThrow(
        "useBookingEventContext must be used within a BookingEventProvider"
      );

      consoleSpy.mockRestore();
    });

    test("sets up all 5 event listeners on mount", () => {
      const queryClient = createTestQueryClient();
      renderHook(() => useBookingEventContext(), {
        wrapper: createWrapper(queryClient),
      });

      expect(wagmiHooks.useWatchContractEvent).toHaveBeenCalledTimes(5);

      // Verify all event listeners are registered
      expect(eventCallbacks).toHaveProperty("ReservationRequested");
      expect(eventCallbacks).toHaveProperty("ReservationConfirmed");
      expect(eventCallbacks).toHaveProperty("BookingCanceled");
      expect(eventCallbacks).toHaveProperty("ReservationRequestCanceled");
      expect(eventCallbacks).toHaveProperty("ReservationRequestDenied");
    });
  });

  describe("ReservationRequested Event", () => {
    test("processes valid reservation request and auto-confirms", async () => {
      mockConfirmReservationMutation.mutateAsync.mockResolvedValueOnce({
        success: true,
      });

      const queryClient = createTestQueryClient();
      renderHook(() => useBookingEventContext(), {
        wrapper: createWrapper(queryClient),
      });

      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const mockLog = {
        args: {
          reservationKey: "reservation-123",
          renter: "0xUserAddress",
          tokenId: "1",
          start: BigInt(futureTimestamp),
          end: BigInt(futureTimestamp + 7200),
        },
      };

      await act(async () => {
        await eventCallbacks.ReservationRequested([mockLog]);
        // Wait for async validation
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      await waitFor(() => {
        expect(mockConfirmReservationMutation.mutateAsync).toHaveBeenCalledWith(
          "reservation-123"
        );
      });
    });

    test("deduplicates multiple identical reservation events", async () => {
      mockConfirmReservationMutation.mutateAsync.mockResolvedValueOnce({
        success: true,
      });

      const queryClient = createTestQueryClient();
      renderHook(() => useBookingEventContext(), {
        wrapper: createWrapper(queryClient),
      });

      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;
      const mockLog = {
        args: {
          reservationKey: "reservation-duplicate",
          renter: "0xUserAddress",
          tokenId: "1",
          start: BigInt(futureTimestamp),
          end: BigInt(futureTimestamp + 7200),
        },
      };

      // Send same event twice
      await act(async () => {
        await eventCallbacks.ReservationRequested([mockLog]);
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      await act(async () => {
        await eventCallbacks.ReservationRequested([mockLog]);
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      await waitFor(() => {
        // Should only be called once due to deduplication
        expect(
          mockConfirmReservationMutation.mutateAsync
        ).toHaveBeenCalledTimes(1);
      });
    });

    test("rejects reservation with start time in the past", async () => {
      const queryClient = createTestQueryClient();
      renderHook(() => useBookingEventContext(), {
        wrapper: createWrapper(queryClient),
      });

      const pastTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const mockLog = {
        args: {
          reservationKey: "reservation-past",
          renter: "0xUserAddress",
          tokenId: "1",
          start: BigInt(pastTimestamp),
          end: BigInt(pastTimestamp + 7200),
        },
      };

      await act(async () => {
        await eventCallbacks.ReservationRequested([mockLog]);
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Should not call confirmation for past reservations
      expect(mockConfirmReservationMutation.mutateAsync).not.toHaveBeenCalled();
    });

    test("rejects reservation with invalid time range (end <= start)", async () => {
      const queryClient = createTestQueryClient();
      renderHook(() => useBookingEventContext(), {
        wrapper: createWrapper(queryClient),
      });

      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;
      const mockLog = {
        args: {
          reservationKey: "reservation-invalid-range",
          renter: "0xUserAddress",
          tokenId: "1",
          start: BigInt(futureTimestamp),
          end: BigInt(futureTimestamp), // end = start (invalid)
        },
      };

      await act(async () => {
        await eventCallbacks.ReservationRequested([mockLog]);
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      expect(mockConfirmReservationMutation.mutateAsync).not.toHaveBeenCalled();
    });

    test("shows success notification to current user on auto-confirm", async () => {
      mockConfirmReservationMutation.mutateAsync.mockResolvedValueOnce({
        success: true,
      });

      const queryClient = createTestQueryClient();
      renderHook(() => useBookingEventContext(), {
        wrapper: createWrapper(queryClient),
      });

      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;
      const mockLog = {
        args: {
          reservationKey: "reservation-notify",
          renter: "0xUserAddress", // Same as current user
          tokenId: "1",
          start: BigInt(futureTimestamp),
          end: BigInt(futureTimestamp + 7200),
        },
      };

      await act(async () => {
        await eventCallbacks.ReservationRequested([mockLog]);
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      await waitFor(() => {
        expect(mockAddTemporaryNotification).toHaveBeenCalledWith(
          "success",
          "✅ Reservation confirmed and ready!"
        );
      });
    });

    test("does not show notification for other users' reservations", async () => {
      mockConfirmReservationMutation.mutateAsync.mockResolvedValueOnce({
        success: true,
      });

      const queryClient = createTestQueryClient();
      renderHook(() => useBookingEventContext(), {
        wrapper: createWrapper(queryClient),
      });

      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;
      const mockLog = {
        args: {
          reservationKey: "reservation-other-user",
          renter: "0xOtherUserAddress", // Different user
          tokenId: "1",
          start: BigInt(futureTimestamp),
          end: BigInt(futureTimestamp + 7200),
        },
      };

      await act(async () => {
        await eventCallbacks.ReservationRequested([mockLog]);
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      await waitFor(() => {
        expect(mockConfirmReservationMutation.mutateAsync).toHaveBeenCalled();
      });

      // Notification should not be called
      expect(mockAddTemporaryNotification).not.toHaveBeenCalled();
    });

    test("handles auto-confirmation errors gracefully", async () => {
      mockConfirmReservationMutation.mutateAsync.mockRejectedValueOnce(
        new Error("Network error")
      );

      const queryClient = createTestQueryClient();
      renderHook(() => useBookingEventContext(), {
        wrapper: createWrapper(queryClient),
      });

      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;
      const mockLog = {
        args: {
          reservationKey: "reservation-error",
          renter: "0xUserAddress",
          tokenId: "1",
          start: BigInt(futureTimestamp),
          end: BigInt(futureTimestamp + 7200),
        },
      };

      await act(async () => {
        await eventCallbacks.ReservationRequested([mockLog]);
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      await waitFor(() => {
        expect(mockAddTemporaryNotification).toHaveBeenCalledWith(
          "error",
          "❌ Reservation denied. Try again later."
        );
      });
    });

    test("marks already confirmed reservation as processed without notification", async () => {
      mockConfirmReservationMutation.mutateAsync.mockRejectedValueOnce(
        new Error("Reservation already confirmed")
      );

      const queryClient = createTestQueryClient();
      renderHook(() => useBookingEventContext(), {
        wrapper: createWrapper(queryClient),
      });

      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;
      const mockLog = {
        args: {
          reservationKey: "reservation-already-confirmed",
          renter: "0xUserAddress",
          tokenId: "1",
          start: BigInt(futureTimestamp),
          end: BigInt(futureTimestamp + 7200),
        },
      };

      await act(async () => {
        await eventCallbacks.ReservationRequested([mockLog]);
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      // Should not show error notification for "already confirmed"
      expect(mockAddTemporaryNotification).not.toHaveBeenCalled();
    });
  });

  describe("ReservationConfirmed Event", () => {
    test("invalidates all booking queries on confirmation", async () => {
      const queryClient = createTestQueryClient();
      const invalidateQueriesSpy = jest.spyOn(queryClient, "invalidateQueries");

      renderHook(() => useBookingEventContext(), {
        wrapper: createWrapper(queryClient),
      });

      const mockLog = {
        args: {
          reservationKey: "reservation-confirmed-123",
          tokenId: "1",
        },
      };

      await act(async () => {
        await eventCallbacks.ReservationConfirmed([mockLog]);
      });

      await waitFor(() => {
        expect(invalidateQueriesSpy).toHaveBeenCalledWith({
          queryKey: bookingQueryKeys.all(),
        });
      });
    });

    test("processes multiple confirmation events", async () => {
      const queryClient = createTestQueryClient();
      const invalidateQueriesSpy = jest.spyOn(queryClient, "invalidateQueries");

      renderHook(() => useBookingEventContext(), {
        wrapper: createWrapper(queryClient),
      });

      const mockLogs = [
        {
          args: {
            reservationKey: "reservation-1",
            tokenId: "1",
          },
        },
        {
          args: {
            reservationKey: "reservation-2",
            tokenId: "2",
          },
        },
      ];

      await act(async () => {
        await eventCallbacks.ReservationConfirmed(mockLogs);
      });

      await waitFor(() => {
        expect(invalidateQueriesSpy).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe("BookingCanceled Event", () => {
    test("refetches queries on booking cancellation", async () => {
      const queryClient = createTestQueryClient();
      const refetchQueriesSpy = jest.spyOn(queryClient, "refetchQueries");

      renderHook(() => useBookingEventContext(), {
        wrapper: createWrapper(queryClient),
      });

      const mockLog = {
        args: {
          reservationKey: "reservation-canceled-123",
          tokenId: "1",
        },
      };

      await act(async () => {
        await eventCallbacks.BookingCanceled([mockLog]);
      });

      await waitFor(() => {
        expect(refetchQueriesSpy).toHaveBeenCalledWith({
          queryKey: bookingQueryKeys.byReservationKey(
            "reservation-canceled-123"
          ),
        });
        expect(refetchQueriesSpy).toHaveBeenCalledWith({
          queryKey: bookingQueryKeys.getReservationsOfToken("1"),
        });
        expect(refetchQueriesSpy).toHaveBeenCalledWith({
          queryKey: bookingQueryKeys.hasActiveBookingByToken("1"),
        });
      });
    });
  });

  describe("ReservationRequestCanceled Event", () => {
    test("refetches queries on request cancellation", async () => {
      const queryClient = createTestQueryClient();
      const refetchQueriesSpy = jest.spyOn(queryClient, "refetchQueries");

      renderHook(() => useBookingEventContext(), {
        wrapper: createWrapper(queryClient),
      });

      const mockLog = {
        args: {
          reservationKey: "request-canceled-123",
          tokenId: "2",
        },
      };

      await act(async () => {
        await eventCallbacks.ReservationRequestCanceled([mockLog]);
      });

      await waitFor(() => {
        expect(refetchQueriesSpy).toHaveBeenCalledWith({
          queryKey: bookingQueryKeys.byReservationKey("request-canceled-123"),
        });
        expect(refetchQueriesSpy).toHaveBeenCalledWith({
          queryKey: bookingQueryKeys.getReservationsOfToken("2"),
        });
      });
    });
  });

  describe("ReservationRequestDenied Event", () => {
    test("refetches queries on request denial", async () => {
      const queryClient = createTestQueryClient();
      const refetchQueriesSpy = jest.spyOn(queryClient, "refetchQueries");

      renderHook(() => useBookingEventContext(), {
        wrapper: createWrapper(queryClient),
      });

      const mockLog = {
        args: {
          reservationKey: "request-denied-123",
          tokenId: "3",
        },
      };

      await act(async () => {
        await eventCallbacks.ReservationRequestDenied([mockLog]);
      });

      await waitFor(() => {
        expect(refetchQueriesSpy).toHaveBeenCalledWith({
          queryKey: bookingQueryKeys.byReservationKey("request-denied-123"),
        });
        expect(refetchQueriesSpy).toHaveBeenCalledWith({
          queryKey: bookingQueryKeys.getReservationsOfToken("3"),
        });
      });
    });
  });

  describe("Edge Cases", () => {
    test("handles missing confirmReservationMutation gracefully", async () => {
      bookingHooks.useConfirmReservationRequest.mockReturnValue(null);

      const queryClient = createTestQueryClient();
      renderHook(() => useBookingEventContext(), {
        wrapper: createWrapper(queryClient),
      });

      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;
      const mockLog = {
        args: {
          reservationKey: "reservation-no-mutation",
          renter: "0xUserAddress",
          tokenId: "1",
          start: BigInt(futureTimestamp),
          end: BigInt(futureTimestamp + 7200),
        },
      };

      await act(async () => {
        await eventCallbacks.ReservationRequested([mockLog]);
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Should not throw, just log error
      expect(mockConfirmReservationMutation.mutateAsync).not.toHaveBeenCalled();
    });

    test("handles events with missing args gracefully", async () => {
      const queryClient = createTestQueryClient();
      const invalidateQueriesSpy = jest.spyOn(queryClient, "invalidateQueries");

      renderHook(() => useBookingEventContext(), {
        wrapper: createWrapper(queryClient),
      });

      const mockLog = {
        args: {
          reservationKey: null,
          tokenId: null,
        },
      };

      await act(async () => {
        await eventCallbacks.ReservationConfirmed([mockLog]);
      });

      // Should not call invalidate with null key
      expect(invalidateQueriesSpy).not.toHaveBeenCalled();
    });

    test("processes events when contract address is available", () => {
      const queryClient = createTestQueryClient();
      renderHook(() => useBookingEventContext(), {
        wrapper: createWrapper(queryClient),
      });

      // Verify all watchers are enabled
      const watcherCalls = wagmiHooks.useWatchContractEvent.mock.calls;
      watcherCalls.forEach((call) => {
        const config = call[0];
        expect(config.enabled).toBe(true);
        expect(config.address).toBe("0xContractAddress");
      });
    });

    test("handles empty event logs array", async () => {
      const queryClient = createTestQueryClient();
      renderHook(() => useBookingEventContext(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        await eventCallbacks.ReservationRequested([]);
      });

      expect(mockConfirmReservationMutation.mutateAsync).not.toHaveBeenCalled();
    });

    test("converts BigInt args to strings correctly", async () => {
      mockConfirmReservationMutation.mutateAsync.mockResolvedValueOnce({
        success: true,
      });

      const queryClient = createTestQueryClient();
      renderHook(() => useBookingEventContext(), {
        wrapper: createWrapper(queryClient),
      });

      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;
      const mockLog = {
        args: {
          reservationKey: BigInt(12345),
          renter: "0xUserAddress",
          tokenId: BigInt(999),
          start: BigInt(futureTimestamp),
          end: BigInt(futureTimestamp + 7200),
        },
      };

      await act(async () => {
        await eventCallbacks.ReservationRequested([mockLog]);
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      await waitFor(() => {
        expect(mockConfirmReservationMutation.mutateAsync).toHaveBeenCalledWith(
          "12345"
        );
      });
    });
  });
});
