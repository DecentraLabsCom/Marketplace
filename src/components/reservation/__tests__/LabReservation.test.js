import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import LabReservation from "../LabReservation"
import * as userContext from "@/context/UserContext"
import * as notificationContext from "@/context/NotificationContext"
import * as labHooks from "@/hooks/lab/useLabs"
import * as bookingHooks from "@/hooks/booking/useBookings"
import * as reservationHooks from "@/hooks/reservation/useLabReservationState"

jest.mock("@/context/UserContext", () => ({
  useUser: jest.fn(),
}))

jest.mock("@/context/NotificationContext", () => ({
  useNotifications: jest.fn(),
}))

jest.mock("@/hooks/lab/useLabs", () => ({
  useLabsForReservation: jest.fn(),
}))

jest.mock("@/hooks/booking/useBookings", () => ({
  useLabBookingsDashboard: jest.fn(),
  useBookingsForCalendar: jest.fn(),
}))

jest.mock("@/hooks/reservation/useLabReservationState", () => ({
  useLabReservationState: jest.fn(),
}))

jest.mock("@/components/auth/AccessControl", () => ({ children }) => (
  <div data-testid="access-control">{children}</div>
))

jest.mock("@/components/reservation/LabDetailsPanel", () => () => (
  <div data-testid="lab-details-panel">Lab Details Panel</div>
))

jest.mock("@/components/ui", () => ({
  Container: ({ children, className }) => (
    <div data-testid="container" className={className}>
      {children}
    </div>
  ),
}))

jest.mock("@/utils/dev/logger", () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

const renderWithProviders = (component) => {
  const queryClient = createTestQueryClient()
  return render(<QueryClientProvider client={queryClient}>{component}</QueryClientProvider>)
}

describe("LabReservation Component", () => {
  const mockAddTemporaryNotification = jest.fn()
  const mockAddErrorNotification = jest.fn()
  const mockReservationRequestMutation = {
    mutateAsync: jest.fn(),
  }
  const mockOpenOnboardingModal = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()

    userContext.useUser.mockReturnValue({
      isSSO: true,
      address: "0x3333333333333333333333333333333333333333",
      institutionBackendUrl: "https://institution.example",
      institutionalOnboardingStatus: "completed",
      openOnboardingModal: mockOpenOnboardingModal,
    })

    notificationContext.useNotifications.mockReturnValue({
      addTemporaryNotification: mockAddTemporaryNotification,
      addErrorNotification: mockAddErrorNotification,
    })

    labHooks.useLabsForReservation.mockReturnValue({
      data: {
        labs: [{ id: "1", name: "Biology Lab", pricePerHour: "100" }],
      },
      isError: false,
    })

    bookingHooks.useLabBookingsDashboard.mockReturnValue({
      data: { bookings: [] },
    })

    bookingHooks.useBookingsForCalendar.mockReturnValue({
      data: { userBookings: [] },
    })

    reservationHooks.useLabReservationState.mockReturnValue({
      date: new Date("2024-12-01"),
      duration: 60,
      selectedTime: "10:00",
      isBooking: false,
      forceRefresh: 0,
      isClient: true,
      minDate: new Date(),
      maxDate: new Date("2024-12-31"),
      availableTimes: [{ value: "10:00", label: "10:00", disabled: false }],
      totalCost: BigInt(100),
      bookingStage: "idle",
      isFlowLocked: false,
      ssoBookingStage: "idle",
      isSSOFlowLocked: false,
      reservationButtonState: {
        label: "Book Now",
        isBusy: false,
        isDisabled: false,
        showSpinner: false,
        ariaBusy: false,
      },
      setIsBooking: jest.fn(),
      setPendingData: jest.fn(),
      handleDateChange: jest.fn(),
      handleDurationChange: jest.fn(),
      handleTimeChange: jest.fn(),
      handleBookingSuccess: jest.fn(),
      startSsoProcessing: jest.fn(),
      markSsoRequestSent: jest.fn(),
      resetSsoReservationFlow: jest.fn(),
      formatPrice: jest.fn((price) => `${price} LAB`),
      reservationRequestMutation: mockReservationRequestMutation,
    })
  })

  test("renders the booking shell", async () => {
    renderWithProviders(<LabReservation id="1" />)

    expect(screen.getByTestId("access-control")).toBeInTheDocument()
    expect(screen.getByText("Book a Lab")).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /book now/i })).toBeInTheDocument()
    })
  })

  test("submits an institutional reservation request", async () => {
    mockReservationRequestMutation.mutateAsync.mockResolvedValueOnce({
      requestId: "reservation-1",
      intent: { payload: { reservationKey: "reservation-1" } },
    })

    renderWithProviders(<LabReservation id="1" />)

    fireEvent.click(await screen.findByRole("button", { name: /book now/i }))

    await waitFor(() => {
      expect(mockReservationRequestMutation.mutateAsync).toHaveBeenCalled()
    })
  })

  test("notifies when institutional backend is missing", async () => {
    userContext.useUser.mockReturnValue({
      isSSO: true,
      address: "0x3333333333333333333333333333333333333333",
      institutionBackendUrl: null,
      institutionalOnboardingStatus: "completed",
      openOnboardingModal: mockOpenOnboardingModal,
    })

    renderWithProviders(<LabReservation id="1" />)

    fireEvent.click(await screen.findByRole("button", { name: /book now/i }))

    await waitFor(() => {
      expect(mockAddTemporaryNotification).toHaveBeenCalledWith(
        "error",
        expect.stringContaining("institutional backend"),
        null,
        expect.objectContaining({
          dedupeKey: "reservation-missing-institutional-backend",
        })
      )
    })
  })
})
