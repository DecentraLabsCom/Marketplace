import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import LabReservation from "../LabReservation"
import * as wagmiHooks from "wagmi"
import * as userContext from "@/context/UserContext"
import * as notificationContext from "@/context/NotificationContext"
import * as labTokenContext from "@/context/LabTokenContext"
import * as labHooks from "@/hooks/lab/useLabs"
import * as bookingHooks from "@/hooks/booking/useBookings"
import * as reservationHooks from "@/hooks/reservation/useLabReservationState"

jest.mock("wagmi", () => ({
  useConnection: jest.fn(),
}))

jest.mock("@/context/UserContext", () => ({
  useUser: jest.fn(),
}))

jest.mock("@/context/NotificationContext", () => ({
  useNotifications: jest.fn(),
}))

jest.mock("@/context/LabTokenContext", () => ({
  useLabToken: jest.fn(),
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

jest.mock("@/contracts/diamond", () => ({
  contractAddresses: {
    sepolia: "0x1111111111111111111111111111111111111111",
  },
}))

jest.mock("@/utils/dev/logger", () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock("@/utils/booking/bookingStatus", () => ({
  isCancelledBooking: jest.fn(() => false),
}))

jest.mock("@/utils/booking/labBookingCalendar", () => ({
  generateTimeOptions: jest.fn(() => [{ value: "10:00", label: "10:00", disabled: false }]),
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

  beforeEach(() => {
    jest.clearAllMocks()

    wagmiHooks.useConnection.mockReturnValue({
      accounts: ["0x3333333333333333333333333333333333333333"],
      chain: { name: "sepolia", id: 11155111 },
      status: "connected",
    })

    userContext.useUser.mockReturnValue({
      isSSO: false,
      address: "0x3333333333333333333333333333333333333333",
      institutionBackendUrl: "https://institution.example",
      hasWalletSession: true,
    })

    notificationContext.useNotifications.mockReturnValue({
      addTemporaryNotification: mockAddTemporaryNotification,
      addErrorNotification: mockAddErrorNotification,
    })

    labTokenContext.useLabToken.mockReturnValue({
      checkBalanceAndAllowance: jest.fn(() => ({
        hasSufficientBalance: true,
        hasSufficientAllowance: true,
        balance: BigInt(1000),
      })),
      formatTokenAmount: jest.fn((amount) => amount.toString()),
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
      isWaitingForReceipt: false,
      isReceiptError: false,
      ssoBookingStage: "idle",
      isSSOFlowLocked: false,
      walletBookingStage: "idle",
      isWalletFlowLocked: false,
      reservationButtonState: {
        label: "Book Now",
        isBusy: false,
        isDisabled: false,
        showSpinner: false,
        ariaBusy: false,
      },
      setIsBooking: jest.fn(),
      setLastTxHash: jest.fn(),
      setPendingData: jest.fn(),
      handleDateChange: jest.fn(),
      handleDurationChange: jest.fn(),
      handleTimeChange: jest.fn(),
      handleBookingSuccess: jest.fn(),
      startSsoProcessing: jest.fn(),
      markSsoRequestSent: jest.fn(),
      resetSsoReservationFlow: jest.fn(),
      startWalletProcessing: jest.fn(),
      resetWalletReservationFlow: jest.fn(),
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

  test("shows insufficient balance notification before booking", async () => {
    labTokenContext.useLabToken.mockReturnValue({
      checkBalanceAndAllowance: jest.fn(() => ({
        hasSufficientBalance: false,
        hasSufficientAllowance: false,
        balance: BigInt(50),
      })),
      formatTokenAmount: jest.fn((amount) => amount.toString()),
    })

    renderWithProviders(<LabReservation id="1" />)

    fireEvent.click(await screen.findByRole("button", { name: /book now/i }))

    await waitFor(() => {
      expect(mockAddTemporaryNotification).toHaveBeenCalledWith(
        "error",
        expect.stringContaining("Insufficient"),
        null,
        expect.objectContaining({
          dedupeKey: "reservation-wallet-insufficient-tokens",
        })
      )
    })

    expect(mockReservationRequestMutation.mutateAsync).not.toHaveBeenCalled()
  })

  test("submits the wallet booking without a separate approval step", async () => {
    labTokenContext.useLabToken.mockReturnValue({
      checkBalanceAndAllowance: jest.fn(() => ({
        hasSufficientBalance: true,
        hasSufficientAllowance: false,
        balance: BigInt(1000),
      })),
      formatTokenAmount: jest.fn((amount) => amount.toString()),
    })

    mockReservationRequestMutation.mutateAsync.mockResolvedValueOnce({
      hash: "0xTransactionHash",
      optimisticId: "optimistic-1",
    })

    renderWithProviders(<LabReservation id="1" />)

    fireEvent.click(await screen.findByRole("button", { name: /book now/i }))

    await waitFor(() => {
      expect(mockReservationRequestMutation.mutateAsync).toHaveBeenCalled()
    })
  })

  test("blocks wallet booking when no wallet is connected", async () => {
    wagmiHooks.useConnection.mockReturnValue({
      accounts: [],
      chain: { name: "sepolia", id: 11155111 },
      status: "disconnected",
    })

    renderWithProviders(<LabReservation id="1" />)

    fireEvent.click(await screen.findByRole("button", { name: /book now/i }))

    await waitFor(() => {
      expect(mockAddTemporaryNotification).toHaveBeenCalledWith(
        "error",
        expect.stringContaining("connect your wallet"),
        null,
        expect.objectContaining({
          dedupeKey: "reservation-wallet-not-connected",
        })
      )
    })
  })
})
