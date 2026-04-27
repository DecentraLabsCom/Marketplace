import { render, screen } from "@testing-library/react"
import LabCreditInfo from "../LabCreditInfo"
import { useLabCredit } from "@/context/LabCreditContext"

jest.mock("@/context/LabCreditContext", () => ({
  useLabCredit: jest.fn(),
}))

describe("LabCreditInfo", () => {
  beforeEach(() => {
    jest.clearAllMocks()

    useLabCredit.mockReturnValue({
      balance: 500000n,
      allowance: 500000n,
      decimals: 5,
      labCreditAddress: "0x1234567890123456789012345678901234567890",
      calculateReservationCost: jest.fn(() => 200000n),
      checkBalanceAndAllowance: jest.fn(() => ({
        hasSufficientBalance: true,
        hasSufficientAllowance: true,
      })),
      formatTokenAmount: jest.fn((amount) => {
        if (typeof amount !== "bigint") return "0"
        return (Number(amount) / 100_000).toString()
      }),
    })
  })

  test("shows a ledger warning when the service credit ledger is unavailable", () => {
    useLabCredit.mockReturnValue({
      balance: 0n,
      allowance: 0n,
      decimals: null,
      labCreditAddress: null,
      calculateReservationCost: jest.fn(() => 0n),
      checkBalanceAndAllowance: jest.fn(() => ({
        hasSufficientBalance: false,
        hasSufficientAllowance: false,
      })),
      formatTokenAmount: jest.fn(() => "0"),
    })

    render(<LabCreditInfo labPrice="100" durationMinutes={60} />)

    expect(screen.getByText(/service credit ledger not available/i)).toBeInTheDocument()
  })

  test("renders balance and reservation cost in credits", () => {
    render(<LabCreditInfo labPrice="100" durationMinutes={60} />)

    expect(screen.getByText(/credit balance:/i)).toBeInTheDocument()
    expect(screen.getByText(/5 credits/i)).toBeInTheDocument()
    expect(screen.getByText(/reservation cost:/i)).toBeInTheDocument()
    expect(screen.getByText(/2 credits/i)).toBeInTheDocument()
  })

  test("shows ready-to-spend state when credit is sufficient", () => {
    render(<LabCreditInfo labPrice="100" durationMinutes={60} />)

    expect(screen.getByText(/sufficient balance/i)).toBeInTheDocument()
    expect(screen.getByText(/credits ready to spend/i)).toBeInTheDocument()
  })

  test("shows additional credits required when balance is insufficient", () => {
    useLabCredit.mockReturnValue({
      balance: 50000n,
      allowance: 50000n,
      decimals: 5,
      labCreditAddress: "0x1234567890123456789012345678901234567890",
      calculateReservationCost: jest.fn(() => 200000n),
      checkBalanceAndAllowance: jest.fn(() => ({
        hasSufficientBalance: false,
        hasSufficientAllowance: false,
      })),
      formatTokenAmount: jest.fn((amount) => {
        if (typeof amount !== "bigint") return "0"
        return (Number(amount) / 100_000).toString()
      }),
    })

    render(<LabCreditInfo labPrice="100" durationMinutes={60} />)

    expect(screen.getByText(/insufficient balance/i)).toBeInTheDocument()
    expect(screen.getByText(/additional credits required/i)).toBeInTheDocument()
  })
})

