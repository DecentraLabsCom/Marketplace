import { render, screen } from "@testing-library/react"
import LabTokenInfo from "../LabTokenInfo"
import { useLabToken } from "@/context/LabTokenContext"

jest.mock("@/context/LabTokenContext", () => ({
  useLabToken: jest.fn(),
}))

describe("LabTokenInfo", () => {
  beforeEach(() => {
    jest.clearAllMocks()

    useLabToken.mockReturnValue({
      balance: 5000000n,
      allowance: 5000000n,
      decimals: 6,
      labTokenAddress: "0x1234567890123456789012345678901234567890",
      calculateReservationCost: jest.fn(() => 2000000n),
      checkBalanceAndAllowance: jest.fn(() => ({
        hasSufficientBalance: true,
        hasSufficientAllowance: true,
      })),
      formatTokenAmount: jest.fn((amount) => {
        if (typeof amount !== "bigint") return "0"
        return (Number(amount) / 1_000_000).toString()
      }),
    })
  })

  test("shows a ledger warning when the service credit ledger is unavailable", () => {
    useLabToken.mockReturnValue({
      balance: 0n,
      allowance: 0n,
      decimals: null,
      labTokenAddress: null,
      calculateReservationCost: jest.fn(() => 0n),
      checkBalanceAndAllowance: jest.fn(() => ({
        hasSufficientBalance: false,
        hasSufficientAllowance: false,
      })),
      formatTokenAmount: jest.fn(() => "0"),
    })

    render(<LabTokenInfo labPrice="100" durationMinutes={60} />)

    expect(screen.getByText(/service credit ledger not available/i)).toBeInTheDocument()
  })

  test("renders balance and reservation cost in credits", () => {
    render(<LabTokenInfo labPrice="100" durationMinutes={60} />)

    expect(screen.getByText(/credit balance:/i)).toBeInTheDocument()
    expect(screen.getByText(/5 credits/i)).toBeInTheDocument()
    expect(screen.getByText(/reservation cost:/i)).toBeInTheDocument()
    expect(screen.getByText(/2 credits/i)).toBeInTheDocument()
  })

  test("shows ready-to-spend state when credit is sufficient", () => {
    render(<LabTokenInfo labPrice="100" durationMinutes={60} />)

    expect(screen.getByText(/sufficient balance/i)).toBeInTheDocument()
    expect(screen.getByText(/credits ready to spend/i)).toBeInTheDocument()
  })

  test("shows additional credits required when balance is insufficient", () => {
    useLabToken.mockReturnValue({
      balance: 500000n,
      allowance: 500000n,
      decimals: 6,
      labTokenAddress: "0x1234567890123456789012345678901234567890",
      calculateReservationCost: jest.fn(() => 2000000n),
      checkBalanceAndAllowance: jest.fn(() => ({
        hasSufficientBalance: false,
        hasSufficientAllowance: false,
      })),
      formatTokenAmount: jest.fn((amount) => {
        if (typeof amount !== "bigint") return "0"
        return (Number(amount) / 1_000_000).toString()
      }),
    })

    render(<LabTokenInfo labPrice="100" durationMinutes={60} />)

    expect(screen.getByText(/insufficient balance/i)).toBeInTheDocument()
    expect(screen.getByText(/additional credits required/i)).toBeInTheDocument()
  })
})
