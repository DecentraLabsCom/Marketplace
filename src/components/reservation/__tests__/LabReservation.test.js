/**
 * Unit Tests for LabReservation Component
 *
 * Validates the full lab booking experience (SSO & wallet), UI flow, and edge cases.
 *
 * Tests Behaviors:
 * - Component rendering and conditional visibility
 * - Lab selection (dropdown + URL auto-select)
 * - Booking button states (idle, loading, disabled, error)
 * - SSO booking flow (server-side, no wallet)
 * - Wallet booking flow (balance, approval, tx, optimistic UI)
 * - Error handling (network, user rejection, validation, reverted tx)
 * - Edge cases (no labs, double booking, manual override, cost = 0)
 */

import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import LabReservation from "../LabReservation";
import * as wagmiHooks from "wagmi";
import * as userContext from "@/context/UserContext";
import * as notificationContext from "@/context/NotificationContext";
import * as labTokenContext from "@/context/LabTokenContext";
import * as labHooks from "@/hooks/lab/useLabs";
import * as bookingHooks from "@/hooks/booking/useBookings";
import * as reservationHooks from "@/hooks/reservation/useLabReservationState";

// Mock all dependencies
jest.mock("wagmi", () => ({
  useAccount: jest.fn(),
}));

jest.mock("@/context/UserContext", () => ({
  useUser: jest.fn(),
}));

jest.mock("@/context/NotificationContext", () => ({
  useNotifications: jest.fn(),
}));

jest.mock("@/context/LabTokenContext", () => ({
  useLabToken: jest.fn(),
}));

jest.mock("@/hooks/lab/useLabs", () => ({
  useLabsForReservation: jest.fn(),
}));

jest.mock("@/hooks/booking/useBookings", () => ({
  useLabBookingsDashboard: jest.fn(),
}));

jest.mock("@/hooks/reservation/useLabReservationState", () => ({
  useLabReservationState: jest.fn(),
}));

jest.mock("@/components/auth/AccessControl", () => {
  return function AccessControl({ children }) {
    return <div data-testid="access-control">{children}</div>;
  };
});

jest.mock("@/components/reservation/LabDetailsPanel", () => {
  return function LabDetailsPanel() {
    return <div data-testid="lab-details-panel">Lab Details Panel</div>;
  };
});

jest.mock("@/components/ui", () => ({
  Container: ({ children, className }) => (
    <div data-testid="container" className={className}>
      {children}
    </div>
  ),
}));

jest.mock("@/contracts/diamond", () => ({
  contractAddresses: {
    sepolia: "0xContractAddress",
    localhost: "0xLocalContract",
  },
}));

jest.mock("@/utils/dev/logger", () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("@/utils/booking/bookingStatus", () => ({
  isCancelledBooking: jest.fn(() => false),
}));

jest.mock("@/utils/booking/labBookingCalendar", () => ({
  generateTimeOptions: jest.fn(() => [
    { value: "10:00", label: "10:00 AM", disabled: false },
    { value: "14:00", label: "2:00 PM", disabled: false },
  ]),
}));

// Helper to create QueryClient
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

// Helper wrapper
const renderWithProviders = (component) => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{component}</QueryClientProvider>
  );
};

describe("LabReservation Component", () => {
  // Mock data
  const mockLabs = [
    { id: "1", name: "Biology Lab", pricePerHour: "100" },
    { id: "2", name: "Chemistry Lab", pricePerHour: "150" },
    { id: "3", name: "Physics Lab", pricePerHour: "200" },
  ];

  const mockBookings = [
    {
      id: "booking-1",
      start: "1700000000",
      end: "1700003600",
      status: 1,
    },
  ];

  // Default mock implementations
  const mockAddTemporaryNotification = jest.fn();
  const mockAddErrorNotification = jest.fn();
  const mockReservationRequestMutation = {
    mutateAsync: jest.fn(),
  };
  const mockBookingCacheUpdates = {
    addOptimisticBooking: jest.fn(() => ({ id: "optimistic-1" })),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock useAccount
    wagmiHooks.useAccount.mockReturnValue({
      chain: { name: "sepolia", id: 11155111 },
      isConnected: true,
      address: "0xUserWallet",
    });

    // Mock useUser
    userContext.useUser.mockReturnValue({
      isSSO: false,
      address: "0xUserWallet",
    });

    // Mock useNotifications
    notificationContext.useNotifications.mockReturnValue({
      addTemporaryNotification: mockAddTemporaryNotification,
      addErrorNotification: mockAddErrorNotification,
    });

    // Mock useLabToken
    labTokenContext.useLabToken.mockReturnValue({
      checkBalanceAndAllowance: jest.fn(() => ({
        hasSufficientBalance: true,
        hasSufficientAllowance: true,
        balance: BigInt(1000),
      })),
      approveLabTokens: jest.fn().mockResolvedValue(true),
      formatTokenAmount: jest.fn((amount) => amount.toString()),
    });

    // Mock useLabsForReservation
    labHooks.useLabsForReservation.mockReturnValue({
      data: { labs: mockLabs },
      isError: false,
    });

    // Mock useLabBookingsDashboard
    bookingHooks.useLabBookingsDashboard.mockReturnValue({
      data: { bookings: mockBookings },
    });

    // Mock useLabReservationState
    reservationHooks.useLabReservationState.mockReturnValue({
      date: new Date("2024-12-01"),
      duration: 60,
      selectedTime: null,
      isBooking: false,
      forceRefresh: 0,
      isClient: true,
      minDate: new Date(),
      maxDate: new Date("2024-12-31"),
      availableTimes: [
        { value: "10:00", label: "10:00 AM", disabled: false },
        { value: "14:00", label: "2:00 PM", disabled: false },
      ],
      totalCost: BigInt(100),
      isWaitingForReceipt: false,
      isReceiptError: false,
      setIsBooking: jest.fn(),
      setLastTxHash: jest.fn(),
      setPendingData: jest.fn(),
      handleDateChange: jest.fn(),
      handleDurationChange: jest.fn(),
      handleTimeChange: jest.fn(),
      handleBookingSuccess: jest.fn(),
      formatPrice: jest.fn((price) => `${price} LAB`),
      reservationRequestMutation: mockReservationRequestMutation,
      bookingCacheUpdates: mockBookingCacheUpdates,
    });
  });

  describe("Component Rendering", () => {
    test("renders lab reservation interface", () => {
      renderWithProviders(<LabReservation />);

      expect(screen.getByText("Book a Lab")).toBeInTheDocument();
      expect(screen.getByText("Select the lab:")).toBeInTheDocument();
      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });

    test("renders within AccessControl wrapper", () => {
      renderWithProviders(<LabReservation />);

      expect(screen.getByTestId("access-control")).toBeInTheDocument();
    });

    test("displays lab options in select dropdown", () => {
      renderWithProviders(<LabReservation />);

      const select = screen.getByRole("combobox");
      expect(select).toBeInTheDocument();

      mockLabs.forEach((lab) => {
        expect(screen.getByText(lab.name)).toBeInTheDocument();
      });
    });

    test("does not render when isClient is false", () => {
      reservationHooks.useLabReservationState.mockReturnValue({
        ...reservationHooks.useLabReservationState(),
        isClient: false,
      });

      const { container } = renderWithProviders(<LabReservation />);

      expect(container.firstChild).toBeNull();
    });

    test("shows error message when labs fail to load", () => {
      labHooks.useLabsForReservation.mockReturnValue({
        data: { labs: [] },
        isError: true,
      });

      renderWithProviders(<LabReservation />);

      expect(
        screen.getByText("❌ Failed to load labs. Please try again later.")
      ).toBeInTheDocument();
    });
  });

  describe("Lab Selection", () => {
    test("allows manual lab selection from dropdown", () => {
      renderWithProviders(<LabReservation />);

      const select = screen.getByRole("combobox");
      fireEvent.change(select, { target: { value: "2" } });

      expect(select.value).toBe("2");
    });

    test("shows LabDetailsPanel and button after lab selection", () => {
      renderWithProviders(<LabReservation />);

      const select = screen.getByRole("combobox");
      fireEvent.change(select, { target: { value: "1" } });

      expect(screen.getByTestId("lab-details-panel")).toBeInTheDocument();
      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    test("auto-selects lab when id prop is provided", async () => {
      renderWithProviders(<LabReservation id="2" />);

      await waitFor(() => {
        const select = screen.getByRole("combobox");
        expect(select.value).toBe("2");
      });
    });

    test("handles invalid lab id gracefully", async () => {
      renderWithProviders(<LabReservation id="999" />);

      await waitFor(() => {
        const select = screen.getByRole("combobox");
        expect(select.value).toBe("");
      });
    });

    test("converts numeric id to string to match lab data", async () => {
      renderWithProviders(<LabReservation id={1} />);

      await waitFor(() => {
        const select = screen.getByRole("combobox");
        expect(select.value).toBe("1");
      });
    });

    test("does not show booking button when no lab is selected", () => {
      renderWithProviders(<LabReservation />);

      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });

  describe("Booking Button States", () => {
    test("shows Book Now button when lab selected and time available", () => {
      reservationHooks.useLabReservationState.mockReturnValue({
        ...reservationHooks.useLabReservationState(),
        selectedTime: "10:00",
      });

      renderWithProviders(<LabReservation id="1" />);

      const button = screen.getByRole("button", { name: /book now/i });
      expect(button).toBeInTheDocument();
      expect(button).not.toBeDisabled();
    });

    test("disables button when no time is selected", () => {
      renderWithProviders(<LabReservation id="1" />);

      const button = screen.getByRole("button", { name: /book now/i });
      expect(button).toBeDisabled();
    });

    test("shows Processing... for SSO booking in progress", () => {
      userContext.useUser.mockReturnValue({
        isSSO: true,
        address: null,
      });

      reservationHooks.useLabReservationState.mockReturnValue({
        ...reservationHooks.useLabReservationState(),
        selectedTime: "10:00",
        isBooking: true,
      });

      renderWithProviders(<LabReservation id="1" />);

      expect(screen.getByText("Processing...")).toBeInTheDocument();
    });

    test("shows Sending... for wallet booking in progress", () => {
      reservationHooks.useLabReservationState.mockReturnValue({
        ...reservationHooks.useLabReservationState(),
        selectedTime: "10:00",
        isBooking: true,
      });

      renderWithProviders(<LabReservation id="1" />);

      expect(screen.getByText("Sending...")).toBeInTheDocument();
    });

    test("shows Confirming... when waiting for receipt", () => {
      reservationHooks.useLabReservationState.mockReturnValue({
        ...reservationHooks.useLabReservationState(),
        selectedTime: "10:00",
        isWaitingForReceipt: true,
      });

      renderWithProviders(<LabReservation id="1" />);

      const button = screen.getByRole("button");
      expect(button).toHaveTextContent("Confirming...");
      expect(button).toBeDisabled();
    });

    test("shows Try Again on receipt error", () => {
      reservationHooks.useLabReservationState.mockReturnValue({
        ...reservationHooks.useLabReservationState(),
        selectedTime: "10:00",
        isReceiptError: true,
      });

      renderWithProviders(<LabReservation id="1" />);

      expect(screen.getByText("Try Again")).toBeInTheDocument();
    });
  });

  describe("SSO Booking Flow", () => {
    beforeEach(() => {
      userContext.useUser.mockReturnValue({
        isSSO: true,
        address: null,
      });

      reservationHooks.useLabReservationState.mockReturnValue({
        ...reservationHooks.useLabReservationState(),
        selectedTime: "10:00",
      });
    });

    test("successfully creates SSO booking", async () => {
      const mockHandleBookingSuccess = jest.fn();
      mockReservationRequestMutation.mutateAsync.mockResolvedValueOnce({
        success: true,
      });

      reservationHooks.useLabReservationState.mockReturnValue({
        ...reservationHooks.useLabReservationState(),
        selectedTime: "10:00",
        handleBookingSuccess: mockHandleBookingSuccess,
      });

      renderWithProviders(<LabReservation id="1" />);

      const button = screen.getByRole("button", { name: /book now/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockReservationRequestMutation.mutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            tokenId: 1,
            start: expect.any(Number),
            end: expect.any(Number),
          })
        );
      });

      expect(mockAddTemporaryNotification).toHaveBeenCalledWith(
        "pending",
        "Reservation request sent! Processing..."
      );
      expect(mockHandleBookingSuccess).toHaveBeenCalled();
    });

    test("handles SSO booking error", async () => {
      const mockError = new Error("Server error");
      mockReservationRequestMutation.mutateAsync.mockRejectedValueOnce(
        mockError
      );

      renderWithProviders(<LabReservation id="1" />);

      const button = screen.getByRole("button", { name: /book now/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockAddErrorNotification).toHaveBeenCalledWith(
          mockError,
          "Failed to create reservation: "
        );
      });
    });
  });

  describe("Wallet Booking Flow", () => {
    beforeEach(() => {
      reservationHooks.useLabReservationState.mockReturnValue({
        ...reservationHooks.useLabReservationState(),
        selectedTime: "10:00",
        totalCost: BigInt(100),
      });
    });

    test("validates wallet connection before booking", async () => {
      wagmiHooks.useAccount.mockReturnValue({
        chain: { name: "sepolia" },
        isConnected: false,
        address: null,
      });

      renderWithProviders(<LabReservation id="1" />);

      const button = screen.getByRole("button", { name: /book now/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockAddTemporaryNotification).toHaveBeenCalledWith(
          "error",
          "🔗 Please connect your wallet first."
        );
      });
    });

    test("validates contract deployment on current network", async () => {
      wagmiHooks.useAccount.mockReturnValue({
        chain: { name: "unsupportedNetwork" },
        isConnected: true,
        address: "0xUserWallet",
      });

      renderWithProviders(<LabReservation id="1" />);

      const button = screen.getByRole("button", { name: /book now/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockAddTemporaryNotification).toHaveBeenCalledWith(
          "error",
          expect.stringContaining("Contract not deployed")
        );
      });
    });

    test("checks token balance before booking", async () => {
      labTokenContext.useLabToken.mockReturnValue({
        checkBalanceAndAllowance: jest.fn(() => ({
          hasSufficientBalance: false,
          hasSufficientAllowance: true,
          balance: BigInt(50),
        })),
        formatTokenAmount: jest.fn((amount) => amount.toString()),
      });

      renderWithProviders(<LabReservation id="1" />);

      const button = screen.getByRole("button", { name: /book now/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockAddTemporaryNotification).toHaveBeenCalledWith(
          "error",
          expect.stringContaining("Insufficient LAB tokens")
        );
      });
    });

    test("requests token approval when needed", async () => {
      const mockApproveLabTokens = jest.fn().mockResolvedValueOnce(true);

      labTokenContext.useLabToken.mockReturnValue({
        checkBalanceAndAllowance: jest.fn(() => ({
          hasSufficientBalance: true,
          hasSufficientAllowance: false,
          balance: BigInt(1000),
        })),
        approveLabTokens: mockApproveLabTokens,
        formatTokenAmount: jest.fn((amount) => amount.toString()),
      });

      mockReservationRequestMutation.mutateAsync.mockResolvedValueOnce({
        hash: "0xTransactionHash",
      });

      renderWithProviders(<LabReservation id="1" />);

      const button = screen.getByRole("button", { name: /book now/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockApproveLabTokens).toHaveBeenCalledWith(BigInt(100));
      });

      expect(mockAddTemporaryNotification).toHaveBeenCalledWith(
        "pending",
        "Approving LAB tokens..."
      );
      expect(mockAddTemporaryNotification).toHaveBeenCalledWith(
        "success",
        "✅ Tokens approved!"
      );
    });

    test("handles token approval rejection", async () => {
      const rejectionError = { code: 4001, message: "User rejected" };

      labTokenContext.useLabToken.mockReturnValue({
        checkBalanceAndAllowance: jest.fn(() => ({
          hasSufficientBalance: true,
          hasSufficientAllowance: false,
          balance: BigInt(1000),
        })),
        approveLabTokens: jest.fn().mockRejectedValueOnce(rejectionError),
        formatTokenAmount: jest.fn((amount) => amount.toString()),
      });

      renderWithProviders(<LabReservation id="1" />);

      const button = screen.getByRole("button", { name: /book now/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockAddTemporaryNotification).toHaveBeenCalledWith(
          "warning",
          "🚫 Token approval rejected by user."
        );
      });

      // Should not proceed to booking
      expect(mockReservationRequestMutation.mutateAsync).not.toHaveBeenCalled();
    });

    test("creates wallet booking with optimistic update", async () => {
      mockReservationRequestMutation.mutateAsync.mockResolvedValueOnce({
        hash: "0xTransactionHash",
      });

      const mockSetLastTxHash = jest.fn();
      const mockSetPendingData = jest.fn();

      reservationHooks.useLabReservationState.mockReturnValue({
        ...reservationHooks.useLabReservationState(),
        selectedTime: "10:00",
        totalCost: BigInt(100),
        setLastTxHash: mockSetLastTxHash,
        setPendingData: mockSetPendingData,
      });

      renderWithProviders(<LabReservation id="1" />);

      const button = screen.getByRole("button", { name: /book now/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockBookingCacheUpdates.addOptimisticBooking).toHaveBeenCalled();
        expect(mockSetLastTxHash).toHaveBeenCalledWith("0xTransactionHash");
        expect(mockSetPendingData).toHaveBeenCalled();
      });
    });

    test("handles user transaction rejection", async () => {
      const rejectionError = { code: 4001 };
      mockReservationRequestMutation.mutateAsync.mockRejectedValueOnce(
        rejectionError
      );

      renderWithProviders(<LabReservation id="1" />);

      const button = screen.getByRole("button", { name: /book now/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockAddTemporaryNotification).toHaveBeenCalledWith(
          "warning",
          "🚫 Transaction rejected by user."
        );
      });
    });

    test("handles execution reverted error", async () => {
      const revertError = {
        message: "execution reverted: Time slot already booked",
      };
      mockReservationRequestMutation.mutateAsync.mockRejectedValueOnce(
        revertError
      );

      renderWithProviders(<LabReservation id="1" />);

      const button = screen.getByRole("button", { name: /book now/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockAddTemporaryNotification).toHaveBeenCalledWith(
          "error",
          "❌ Time slot was reserved while you were booking. Please try another time."
        );
      });
    });
  });

  describe("Edge Cases", () => {
    test("validates cost calculation", async () => {
      reservationHooks.useLabReservationState.mockReturnValue({
        ...reservationHooks.useLabReservationState(),
        selectedTime: "10:00",
        totalCost: BigInt(0), // Invalid cost
      });

      renderWithProviders(<LabReservation id="1" />);

      const button = screen.getByRole("button", { name: /book now/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockAddTemporaryNotification).toHaveBeenCalledWith(
          "error",
          "❌ Unable to calculate booking cost."
        );
      });
    });

    test("prevents double booking attempts when isBooking is true", async () => {
      reservationHooks.useLabReservationState.mockReturnValue({
        ...reservationHooks.useLabReservationState(),
        selectedTime: "10:00",
        isBooking: true,
      });

      renderWithProviders(<LabReservation id="1" />);

      const button = screen.getByRole("button");

      // Button is disabled, but even if we tried to click
      fireEvent.click(button);

      // Should not make any API calls
      expect(mockReservationRequestMutation.mutateAsync).not.toHaveBeenCalled();
    });

    test("handles empty labs array", () => {
      labHooks.useLabsForReservation.mockReturnValue({
        data: { labs: [] },
        isError: false,
      });

      renderWithProviders(<LabReservation />);

      const select = screen.getByRole("combobox");
      expect(select.children.length).toBe(1); // Only "Select a lab" option
    });

    test("does not auto-select when lab already manually selected", async () => {
      const { rerender } = renderWithProviders(<LabReservation id="1" />);

      await waitFor(() => {
        const select = screen.getByRole("combobox");
        expect(select.value).toBe("1");
      });

      // Manually change selection
      const select = screen.getByRole("combobox");
      fireEvent.change(select, { target: { value: "2" } });

      // Re-render with same id prop - should not override manual selection
      rerender(
        <QueryClientProvider client={createTestQueryClient()}>
          <LabReservation id="1" />
        </QueryClientProvider>
      );

      expect(select.value).toBe("2");
    });
  });
});
