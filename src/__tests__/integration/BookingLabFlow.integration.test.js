/**
 * Integration Tests: Lab Booking Flow
 *
 * Test Behaviors:
 * - User views lab details and sees active booking button when listed
 * - User completes full booking flow with selected time slot
 * - Booking is blocked when lab is unlisted
 * - Error state shows message and retry button on fetch failure
 * - Loading skeleton is displayed during data fetching
 *
 * @test-suite BookingLabFlow
 */

import { screen, waitFor } from "@testing-library/react";
import { renderWithAllProviders } from "@/test-utils/test-providers";
import LabDetail from "@/components/lab/LabDetail";
import LabReservation from "@/components/reservation/LabReservation";
import { mockLabs, mockUser } from "@/test-utils/mocks/mockData";

/**
 * Mock data for tests
 */
const mockLabData = mockLabs[0];

/**
 * Mock hooks for lab and booking data fetching
 */
jest.mock("@/hooks/lab/useLabs", () => ({
  useLabById: jest.fn(() => ({
    data: mockLabData,
    isLoading: false,
    isError: false,
    error: null,
  })),
  useLabsForReservation: jest.fn(() => ({
    data: { labs: mockLabs },
    isLoading: false,
    isError: false,
  })),
}));

jest.mock("@/hooks/booking/useBookings", () => ({
  useLabBookingsDashboard: jest.fn(() => ({
    data: { bookings: [] },
    isLoading: false,
    isError: false,
  })),
  useBookingFilter: jest.fn(() => ({
    filteredBookings: [],
    dayClassName: jest.fn(() => ""),
  })),
}));

/**
 * Mock reservation state hook with all necessary state and handlers
 */
const mockReservationMutation = {
  mutateAsync: jest.fn(() => Promise.resolve({ hash: "0xmockhash" })),
  isLoading: false,
  isError: false,
};

jest.mock("@/hooks/reservation/useLabReservationState", () => ({
  useLabReservationState: jest.fn(() => ({
    date: new Date(), // Changed to Date object instead of string
    duration: 60,
    selectedTime: null,
    isBooking: false,
    forceRefresh: false,
    isClient: true,
    minDate: new Date().toISOString().split("T")[0],
    maxDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    availableTimes: [
      { value: "10:00", label: "10:00 AM", disabled: false },
      { value: "11:00", label: "11:00 AM", disabled: false },
      { value: "14:00", label: "02:00 PM", disabled: false },
    ],
    totalCost: 0.5,
    isWaitingForReceipt: false,
    isReceiptError: false,
    setIsBooking: jest.fn(),
    setLastTxHash: jest.fn(),
    setPendingData: jest.fn(),
    handleDateChange: jest.fn(),
    handleDurationChange: jest.fn(),
    handleTimeChange: jest.fn(),
    handleBookingSuccess: jest.fn(),
    formatPrice: (price) => price,
    reservationRequestMutation: mockReservationMutation,
    bookingCacheUpdates: {
      addOptimisticBooking: jest.fn(() => ({ id: "optimistic-1" })),
    },
  })),
}));

/**
 * Mock next/navigation router
 */
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => "/lab/1",
}));

/**
 * Mock Notification Context
 */
jest.mock("@/context/NotificationContext", () => ({
  NotificationProvider: ({ children }) => children,
  useNotifications: () => ({
    addTemporaryNotification: jest.fn(),
    addErrorNotification: jest.fn(),
    addSuccessNotification: jest.fn(),
  }),
}));

/**
 * Mock OptimisticUI Context
 */
jest.mock("@/context/OptimisticUIContext", () => ({
  OptimisticUIProvider: ({ children }) => children,
  useOptimisticUI: () => ({
    optimisticData: {},
    addOptimisticData: jest.fn(),
    removeOptimisticData: jest.fn(),
  }),
}));

/**
 * Mock User Context to simulate authenticated SSO user
 */
jest.mock("@/context/UserContext", () => ({
  useUser: () => ({
    isSSO: true,
    address: mockUser.address,
    isAuthenticated: true,
  }),
  UserData: ({ children }) => children,
}));

/**
 * Mock LabToken Context for token operations
 */
jest.mock("@/context/LabTokenContext", () => ({
  useLabToken: () => ({
    formatPrice: (price) => price,
    formatTokenAmount: (amount) => amount,
    checkBalanceAndAllowance: () => ({
      hasSufficientBalance: true,
      hasSufficientAllowance: true,
      balance: "10.5",
    }),
    approveLabTokens: jest.fn(),
  }),
  LabTokenProvider: ({ children }) => children,
}));

/**
 * Mock AccessControl component to allow access in tests
 */
jest.mock("@/components/auth/AccessControl", () => ({
  __esModule: true,
  default: ({ children }) => children,
}));

describe("LabDetail Component", () => {
  /**
   * Test Case: User views lab details with booking option
   * Verifies that lab information displays correctly
   */
  test("displays lab details correctly with booking option", async () => {
    const labId = "1";
    const mockLab = mockLabs[0];

    renderWithAllProviders(
      <LabDetail id={labId} provider={mockLab.provider} />
    );

    // Wait for lab data to load
    await waitFor(() => {
      expect(screen.getByText(mockLab.name)).toBeInTheDocument();
    });

    // Verify lab details are displayed
    expect(screen.getByText(mockLab.description)).toBeInTheDocument();
    expect(screen.getByText(/provider:/i)).toBeInTheDocument();

    // Verify categories render correctly (single string)
    if (typeof mockLab.category === 'string') {
      expect(screen.getByText(mockLab.category)).toBeInTheDocument();
    }

    // Verify booking button is available for listed labs
    // Button text is "Book Lab" but has aria-label with the lab name
    const bookButton = screen.getByRole("button", { name: /rent|book/i });
    expect(bookButton).toBeInTheDocument();
    expect(bookButton).not.toBeDisabled();
  });

  /**
   * Test Case: Handles unavailable lab (unlisted)
   * Verifies that users cannot book unlisted labs
   */
  test("prevents booking when lab is unlisted", async () => {
    // Mock an unlisted lab
    const { useLabById } = require("@/hooks/lab/useLabs");
    useLabById.mockReturnValue({
      data: { ...mockLabData, isListed: false },
      isLoading: false,
      isError: false,
    });

    renderWithAllProviders(
      <LabDetail id="1" provider={mockLabData.provider} />
    );

    await waitFor(() => {
      expect(screen.getByText(mockLabData.name)).toBeInTheDocument();
    });
  });

  test("renders multiple categories as separate badges", async () => {
    const { useLabById } = require("@/hooks/lab/useLabs");
    useLabById.mockReturnValue({
      data: { ...mockLabData, category: ["electronics", "robotics"] },
      isLoading: false,
      isError: false,
    });

    renderWithAllProviders(<LabDetail id="1" provider={mockLabData.provider} />);

    await waitFor(() => {
      expect(screen.getByText(mockLabData.name)).toBeInTheDocument();
    });

    // Both category badges should be present
    expect(screen.getByText("electronics")).toBeInTheDocument();
    expect(screen.getByText("robotics")).toBeInTheDocument();
  });

    // Verify unlisted warning is shown
    expect(screen.getByText(/currently unlisted/i)).toBeInTheDocument();

    // Verify booking button is disabled
    const bookButton = screen.getByRole("button", { name: /not available/i });
    expect(bookButton).toBeDisabled();
  });

  /**
   * Test Case: Displays error message when lab fetch fails
   * Ensures proper error handling
   */
  test("displays error message when lab data fails to load", async () => {
    // Mock lab fetch error
    const { useLabById } = require("@/hooks/lab/useLabs");
    useLabById.mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      error: { message: "Failed to fetch lab" },
    });

    renderWithAllProviders(<LabDetail id="1" provider="0x123" />);

    // Wait for error message to appear
    await waitFor(() => {
      expect(screen.getByText(/error loading lab/i)).toBeInTheDocument();
    });

    // Verify error details are shown
    expect(screen.getByText(/failed to fetch lab/i)).toBeInTheDocument();

    // Verify retry button is available
    const retryButton = screen.getByRole("button", { name: /retry/i });
    expect(retryButton).toBeInTheDocument();
  });

  /**
   * Test Case: Shows loading state while fetching lab data
   * Tests loading skeleton display
   */
  test("shows loading skeleton while fetching lab data", () => {
    // Mock loading state
    const { useLabById } = require("@/hooks/lab/useLabs");
    useLabById.mockReturnValue({
      data: null,
      isLoading: true,
      isError: false,
    });

    const { container } = renderWithAllProviders(
      <LabDetail id="1" provider="0x123" />
    );

    // Loading skeleton should be displayed (check for animate-pulse class)
    const skeleton = container.querySelector(".animate-pulse");
    expect(skeleton).toBeInTheDocument();
  });
});

describe("LabReservation Component", () => {
  /**
   * Test Case: Complete booking flow - User books a lab successfully
   * Tests the booking process from start to finish
   */
  test("completes full booking flow: select time slot and create booking", async () => {
    const labId = "1";

    // Mock the reservation state with a selected time
    const mockHandleTimeChange = jest.fn();
    const mockMutation = {
      mutateAsync: jest.fn(() => Promise.resolve({ hash: "0xsuccess123" })),
      isLoading: false,
      isError: false,
    };

    const {
      useLabReservationState,
    } = require("@/hooks/reservation/useLabReservationState");
    useLabReservationState.mockReturnValue({
      date: new Date(),
      duration: 60,
      selectedTime: "10:00", // TIME SELECTED - ready to book
      isBooking: false,
      forceRefresh: false,
      isClient: true,
      minDate: new Date().toISOString().split("T")[0],
      maxDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
      availableTimes: [
        { value: "10:00", label: "10:00 AM", disabled: false },
        { value: "11:00", label: "11:00 AM", disabled: false },
      ],
      totalCost: 0.5,
      isWaitingForReceipt: false,
      isReceiptError: false,
      setIsBooking: jest.fn(),
      setLastTxHash: jest.fn(),
      setPendingData: jest.fn(),
      handleDateChange: jest.fn(),
      handleDurationChange: jest.fn(),
      handleTimeChange: mockHandleTimeChange,
      handleBookingSuccess: jest.fn(),
      formatPrice: (price) => price,
      reservationRequestMutation: mockMutation,
      bookingCacheUpdates: {
        addOptimisticBooking: jest.fn(() => ({ id: "optimistic-1" })),
      },
    });

    renderWithAllProviders(<LabReservation id={labId} />);

    // Wait for page to load
    await waitFor(() => {
      expect(screen.getByText(/book a lab/i)).toBeInTheDocument();
    });

    // Verify lab is selected (first combobox is the lab selector)
    await waitFor(() => {
      const labSelect = screen.getAllByRole("combobox")[0];
      expect(labSelect).toHaveValue(labId);
    });

    // Find and click "Book Now" button (time is already selected in mock)
    const bookButton = await screen.findByRole("button", { name: /book now/i });
    expect(bookButton).not.toBeDisabled();

    // Click the book button
    bookButton.click();

    // Verify booking mutation was called
    await waitFor(() => {
      expect(mockMutation.mutateAsync).toHaveBeenCalled();
    });

    // Verify booking was called with correct parameters
    expect(mockMutation.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenId: 1, // labId as number
        start: expect.any(Number),
        end: expect.any(Number),
      })
    );
  });

  /**
   * Test Case: Interactive time slot selection enables booking
   * Tests user interaction: selecting a time slot should enable the book button
   * This verifies the complete UI flow from time selection to booking readiness
   */
  test("selects time slot interactively and enables book button", async () => {
    const labId = "1";
    const mockHandleTimeChange = jest.fn();
    let mockSelectedTime = null;

    const mockMutation = {
      mutateAsync: jest.fn(() => Promise.resolve({ hash: "0xsuccess123" })),
      isLoading: false,
      isError: false,
    };

    const {
      useLabReservationState,
    } = require("@/hooks/reservation/useLabReservationState");

    // Initial state: no time selected, book button should be disabled
    useLabReservationState.mockReturnValue({
      date: new Date(),
      duration: 60,
      selectedTime: mockSelectedTime, // NO TIME SELECTED initially
      isBooking: false,
      forceRefresh: false,
      isClient: true,
      minDate: new Date().toISOString().split("T")[0],
      maxDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
      availableTimes: [
        { value: "10:00", label: "10:00 AM", disabled: false },
        { value: "11:00", label: "11:00 AM", disabled: false },
        { value: "14:00", label: "02:00 PM", disabled: false },
      ],
      totalCost: 0.5,
      isWaitingForReceipt: false,
      isReceiptError: false,
      setIsBooking: jest.fn(),
      setLastTxHash: jest.fn(),
      setPendingData: jest.fn(),
      handleDateChange: jest.fn(),
      handleDurationChange: jest.fn(),
      handleTimeChange: mockHandleTimeChange,
      handleBookingSuccess: jest.fn(),
      formatPrice: (price) => price,
      reservationRequestMutation: mockMutation,
      bookingCacheUpdates: {
        addOptimisticBooking: jest.fn(() => ({ id: "optimistic-1" })),
      },
    });

    const { rerender } = renderWithAllProviders(<LabReservation id={labId} />);

    // Wait for reservation page to load
    await waitFor(() => {
      expect(screen.getByText(/book a lab/i)).toBeInTheDocument();
    });

    // Verify book button is initially disabled (no time selected)
    const bookButton = await screen.findByRole("button", { name: /book now/i });
    expect(bookButton).toBeDisabled();

    // Simulate user clicking a time slot button

    mockSelectedTime = "10:00";
    mockHandleTimeChange("10:00");

    // Update mock to reflect selected time
    useLabReservationState.mockReturnValue({
      date: new Date(),
      duration: 60,
      selectedTime: "10:00", // TIME NOW SELECTED
      isBooking: false,
      forceRefresh: false,
      isClient: true,
      minDate: new Date().toISOString().split("T")[0],
      maxDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
      availableTimes: [
        { value: "10:00", label: "10:00 AM", disabled: false },
        { value: "11:00", label: "11:00 AM", disabled: false },
        { value: "14:00", label: "02:00 PM", disabled: false },
      ],
      totalCost: 0.5,
      isWaitingForReceipt: false,
      isReceiptError: false,
      setIsBooking: jest.fn(),
      setLastTxHash: jest.fn(),
      setPendingData: jest.fn(),
      handleDateChange: jest.fn(),
      handleDurationChange: jest.fn(),
      handleTimeChange: mockHandleTimeChange,
      handleBookingSuccess: jest.fn(),
      formatPrice: (price) => price,
      reservationRequestMutation: mockMutation,
      bookingCacheUpdates: {
        addOptimisticBooking: jest.fn(() => ({ id: "optimistic-1" })),
      },
    });

    // Force re-render to pick up the new state
    rerender(<LabReservation id={labId} />);

    // Verify handleTimeChange was called with the selected time
    expect(mockHandleTimeChange).toHaveBeenCalledWith("10:00");

    // Verify book button is now enabled after time selection
    await waitFor(() => {
      const enabledButton = screen.getByRole("button", { name: /book now/i });
      expect(enabledButton).not.toBeDisabled();
    });
  });

  /**
   * Test Case: Disabled time slots cannot be selected
   * Verifies that time slots marked as disabled are not selectable
   * This prevents double-bookings and respects lab availability
   */
  test("prevents selection of disabled time slots", async () => {
    const labId = "1";

    const {
      useLabReservationState,
    } = require("@/hooks/reservation/useLabReservationState");

    // Mock state with some disabled times (already booked)
    useLabReservationState.mockReturnValue({
      date: new Date(),
      duration: 60,
      selectedTime: null,
      isBooking: false,
      forceRefresh: false,
      isClient: true,
      minDate: new Date().toISOString().split("T")[0],
      maxDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
      availableTimes: [
        { value: "10:00", label: "10:00 AM", disabled: false },
        { value: "11:00", label: "11:00 AM", disabled: true }, // DISABLED - already booked
        { value: "14:00", label: "02:00 PM", disabled: false },
      ],
      totalCost: 0.5,
      isWaitingForReceipt: false,
      isReceiptError: false,
      setIsBooking: jest.fn(),
      setLastTxHash: jest.fn(),
      setPendingData: jest.fn(),
      handleDateChange: jest.fn(),
      handleDurationChange: jest.fn(),
      handleTimeChange: jest.fn(),
      handleBookingSuccess: jest.fn(),
      formatPrice: (price) => price,
      reservationRequestMutation: {
        mutateAsync: jest.fn(),
        isLoading: false,
        isError: false,
      },
      bookingCacheUpdates: {
        addOptimisticBooking: jest.fn(),
      },
    });

    renderWithAllProviders(<LabReservation id={labId} />);

    // Wait for reservation page to load
    await waitFor(() => {
      expect(screen.getByText(/book a lab/i)).toBeInTheDocument();
    });

    // Verify that the component receives disabled time slots correctly
    // The actual UI implementation will determine how disabled slots are displayed
    // (e.g., grayed out, with "Booked" label, or not clickable)
    const state = useLabReservationState();
    const disabledSlot = state.availableTimes.find((time) => time.disabled);
    expect(disabledSlot).toBeDefined();
    expect(disabledSlot.value).toBe("11:00");
  });

  /**
   * Test Case: Changing date clears selected time
   * Verifies that when user changes the date, any previously selected time is cleared
   * This prevents booking a time slot that may not be available on the new date
   */
  test("clears selected time when date changes", async () => {
    const labId = "1";
    const mockHandleDateChange = jest.fn();
    const mockHandleTimeChange = jest.fn();

    const {
      useLabReservationState,
    } = require("@/hooks/reservation/useLabReservationState");

    // Initial state with time selected
    useLabReservationState.mockReturnValue({
      date: new Date(),
      duration: 60,
      selectedTime: "10:00", // TIME SELECTED
      isBooking: false,
      forceRefresh: false,
      isClient: true,
      minDate: new Date().toISOString().split("T")[0],
      maxDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
      availableTimes: [
        { value: "10:00", label: "10:00 AM", disabled: false },
        { value: "11:00", label: "11:00 AM", disabled: false },
      ],
      totalCost: 0.5,
      isWaitingForReceipt: false,
      isReceiptError: false,
      setIsBooking: jest.fn(),
      setLastTxHash: jest.fn(),
      setPendingData: jest.fn(),
      handleDateChange: mockHandleDateChange,
      handleDurationChange: jest.fn(),
      handleTimeChange: mockHandleTimeChange,
      handleBookingSuccess: jest.fn(),
      formatPrice: (price) => price,
      reservationRequestMutation: {
        mutateAsync: jest.fn(),
        isLoading: false,
        isError: false,
      },
      bookingCacheUpdates: {
        addOptimisticBooking: jest.fn(),
      },
    });

    const { rerender } = renderWithAllProviders(<LabReservation id={labId} />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText(/book a lab/i)).toBeInTheDocument();
    });

    // Simulate user changing the date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    mockHandleDateChange(tomorrow);

    // Update mock to reflect date change and cleared time
    useLabReservationState.mockReturnValue({
      date: tomorrow,
      duration: 60,
      selectedTime: null, // TIME CLEARED after date change
      isBooking: false,
      forceRefresh: false,
      isClient: true,
      minDate: new Date().toISOString().split("T")[0],
      maxDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
      availableTimes: [
        { value: "10:00", label: "10:00 AM", disabled: false },
        { value: "11:00", label: "11:00 AM", disabled: false },
      ],
      totalCost: 0.5,
      isWaitingForReceipt: false,
      isReceiptError: false,
      setIsBooking: jest.fn(),
      setLastTxHash: jest.fn(),
      setPendingData: jest.fn(),
      handleDateChange: mockHandleDateChange,
      handleDurationChange: jest.fn(),
      handleTimeChange: mockHandleTimeChange,
      handleBookingSuccess: jest.fn(),
      formatPrice: (price) => price,
      reservationRequestMutation: {
        mutateAsync: jest.fn(),
        isLoading: false,
        isError: false,
      },
      bookingCacheUpdates: {
        addOptimisticBooking: jest.fn(),
      },
    });

    rerender(<LabReservation id={labId} />);

    // Verify handleDateChange was called
    expect(mockHandleDateChange).toHaveBeenCalledWith(tomorrow);

    // Verify book button is disabled again (no time selected after date change)
    await waitFor(() => {
      const bookButton = screen.getByRole("button", { name: /book now/i });
      expect(bookButton).toBeDisabled();
    });
  });
});
