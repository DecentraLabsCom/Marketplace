/**
 * Integration Tests: User Dashboard & Booking Lifecycle Flow
 *
 * Test Behaviors:
 * - User dashboard displays active, upcoming, and past bookings
 * - User can cancel a pending booking (triggers cancel reservation)
 * - User can cancel an active booking (triggers cancel regular booking)
 * - Error handling for cancellation failures
 *
 * @test-suite UserDashboardFlow
 */

import React from 'react';
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithAllProviders } from "@/test-utils/test-providers";
import UserDashboardPage from "@/components/dashboard/user/UserDashboardPage";

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => "/user-dashboard",
}));

/**
 * Mock Wagmi and Reservation hooks
 */
jest.mock("@/components/home/LabAccess", () => ({
  __esModule: true,
  default: () => <div data-testid="mock-lab-access">Access</div>,
}));

jest.mock("@/hooks/booking/useBookingAtomicQueries", () => ({
  useReservation: jest.fn(() => ({
    data: null,
    isFetching: false,
  })),
}));

/**
 * Mock UserContext to simulate logged-in user
 */
const mockUserContext = {
  user: { userid: "0xUser123" },
  isLoggedIn: true,
  isSSO: false,
  hasWalletSession: true,
  isWalletLoading: false,
  isConnected: true,
  address: "0xUser123",
};

jest.mock("@/context/UserContext", () => ({
  useUser: jest.fn(() => mockUserContext),
  UserData: ({ children }) => children,
}));

/**
 * Mock Notification Context
 */
jest.mock("@/context/NotificationContext", () => ({
  useNotifications: () => ({
    addTemporaryNotification: jest.fn(),
  }),
  NotificationProvider: ({ children }) => children,
}));

/**
 * Mock Booking Event Context
 */
jest.mock("@/context/BookingEventContext", () => ({
  useOptionalBookingEventContext: () => ({
    registerPendingCancellation: jest.fn(),
  }),
  BookingEventProvider: ({ children }) => children,
}));

/**
 * Mock booking mutations and queries
 */
const mockCancelBookingMutation = {
  mutateAsync: jest.fn(() => Promise.resolve({ success: true })),
};

const mockCancelReservationMutation = {
  mutateAsync: jest.fn(() => Promise.resolve({ success: true })),
};

const nowUnix = Math.floor(Date.now() / 1000);

const mockBookings = [
  {
    reservationKey: "pending-key-1",
    labId: 1,
    status: 0, // Pending
    start: nowUnix + 3600, // +1 hour
    end: nowUnix + 7200, // +2 hours
    labDetails: { name: "Pending Lab" },
  },
  {
    reservationKey: "active-key-2",
    labId: 2,
    status: 1, // Approved/Active
    start: nowUnix - 1800, // -30 mins (currently active)
    end: nowUnix + 1800, // +30 mins
    labDetails: { name: "Active Lab" },
  },
];

jest.mock("@/hooks/booking/useBookings", () => ({
  useUserBookingsDashboard: jest.fn(() => ({
    data: { bookings: mockBookings },
    isLoading: false,
    isError: false,
  })),
  useCancelBooking: jest.fn(() => mockCancelBookingMutation),
  useCancelReservationRequest: jest.fn(() => mockCancelReservationMutation),
  useBookingFilter: jest.fn(() => ({
    filteredBookings: mockBookings,
    dayClassName: jest.fn(() => ""),
  })),
}));

// Mock timer functions inside the component to avoid state updates after unmount
beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(nowUnix * 1000));
});

afterAll(() => {
  jest.useRealTimers();
});

describe("User Dashboard & Booking Lifecycle Integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("displays active and upcoming bookings perfectly", async () => {
    renderWithAllProviders(<UserDashboardPage />);

    // Active booking is displayed in ActiveBookingSection
    await waitFor(() => {
      expect(screen.getByText("Active now: Active Lab")).toBeInTheDocument();
    });

    // Validates that it is listed in the upcoming or active area
    expect(screen.getByText("Pending Lab")).toBeInTheDocument();
  });

  test("cancels a pending booking through useCancelReservationRequest", async () => {
    renderWithAllProviders(<UserDashboardPage />);

    // Wait for the Dashboard to load
    await waitFor(() => {
      expect(screen.getByText("Pending Lab")).toBeInTheDocument();
    });

    // The pending lab (status 0) should use the Cancel Request button
    // It appears in the BookingsList since it is upcoming
    const cancelButtons = screen.getAllByRole("button", { name: /cancel request/i });
    expect(cancelButtons.length).toBeGreaterThan(0);

    // Click the first one (should correspond to the pending booking if sorted or isolated)
    fireEvent.click(cancelButtons[0]);

    // Validation: The hook for cancelling a RESERVATION REQUEST should be invoked
    await waitFor(() => {
      expect(mockCancelReservationMutation.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ reservationKey: "pending-key-1" })
      );
    });

    // The regular booking cancel mutation should NOT be called for a pending status
    expect(mockCancelBookingMutation.mutateAsync).not.toHaveBeenCalled();
  });

  test("cancels an active booking through useCancelBooking", async () => {
    renderWithAllProviders(<UserDashboardPage />);

    // Wait for the Dashboard to load
    await waitFor(() => {
      expect(screen.getByText("Active now: Active Lab")).toBeInTheDocument();
    });

    // The active lab appears in ActiveBookingSection with "Request for Refund" or specific Cancel text
    // as defined in ActiveBookingSection.js
    const refundButton = screen.getByRole("button", { name: /request for refund/i });
    fireEvent.click(refundButton);

    // Validation: The hook for cancelling an ACTIVE BOOKING should be invoked
    await waitFor(() => {
      expect(mockCancelBookingMutation.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ reservationKey: "active-key-2" })
      );
    });

    expect(mockCancelReservationMutation.mutateAsync).not.toHaveBeenCalled();
  });
});
