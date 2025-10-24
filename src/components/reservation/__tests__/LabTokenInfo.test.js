/**
 * Unit tests for LabTokenInfo component
 *
 * Test Behaviors:
 * - Shows warning when token contract unavailable on network
 * - Displays user's LAB token balance
 * - Shows reservation cost when duration > 0
 * - Displays green indicator when balance is sufficient
 * - Displays red indicator when balance is insufficient
 * - Displays green indicator when tokens are approved
 * - Displays yellow indicator when approval is required
 * - Hides cost and indicators when reservation cost is zero
 * - Applies custom className prop
 */

import { render, screen } from "@testing-library/react";
import LabTokenInfo from "../LabTokenInfo";
import { useLabToken } from "@/context/LabTokenContext";

jest.mock("@/context/LabTokenContext", () => ({
  useLabToken: jest.fn(),
}));

describe("LabTokenInfo - unit tests", () => {
  const mockUseLabTokenDefaults = {
    balance: 1000000000000000000n, // 1 token (18 decimals)
    decimals: 18,
    labTokenAddress: "0x1234567890123456789012345678901234567890",
    calculateReservationCost: jest.fn(),
    checkBalanceAndAllowance: jest.fn(),
    formatTokenAmount: jest.fn((amount) => {
      // Simple mock formatter: divide by 10^18
      if (typeof amount === "bigint") {
        return (Number(amount) / 1e18).toString();
      }
      return "0";
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useLabToken.mockReturnValue(mockUseLabTokenDefaults);
  });

  describe("Token Contract Availability", () => {
    // Network compatibility check: shows warning if token not deployed on current network
    test("shows warning when labTokenAddress is missing", () => {
      useLabToken.mockReturnValue({
        ...mockUseLabTokenDefaults,
        labTokenAddress: null,
        // Still need to provide these functions to prevent crashes
        calculateReservationCost: jest.fn(() => 0n),
        checkBalanceAndAllowance: jest.fn(() => ({
          hasSufficientBalance: false,
          hasSufficientAllowance: false,
        })),
      });

      render(<LabTokenInfo labPrice="100" durationMinutes={60} />);

      expect(
        screen.getByText(/lab token contract not available/i)
      ).toBeInTheDocument();
    });

    test("shows warning when decimals are missing", () => {
      useLabToken.mockReturnValue({
        ...mockUseLabTokenDefaults,
        decimals: null,
        // Still need to provide these functions to prevent crashes
        calculateReservationCost: jest.fn(() => 0n),
        checkBalanceAndAllowance: jest.fn(() => ({
          hasSufficientBalance: false,
          hasSufficientAllowance: false,
        })),
      });

      render(<LabTokenInfo labPrice="100" durationMinutes={60} />);

      expect(
        screen.getByText(/lab token contract not available/i)
      ).toBeInTheDocument();
    });
  });

  describe("Balance Display", () => {
    test("displays user LAB token balance", () => {
      useLabToken.mockReturnValue({
        ...mockUseLabTokenDefaults,
        balance: 5000000000000000000n, // 5 tokens
        calculateReservationCost: jest.fn(() => 0n),
        checkBalanceAndAllowance: jest.fn(() => ({
          hasSufficientBalance: true,
          hasSufficientAllowance: true,
        })),
      });

      render(<LabTokenInfo labPrice="100" durationMinutes={60} />);

      expect(screen.getByText(/\$lab balance:/i)).toBeInTheDocument();
      expect(screen.getByText(/5.*\$lab/i)).toBeInTheDocument();
    });

    test("displays zero balance when user has no tokens", () => {
      useLabToken.mockReturnValue({
        ...mockUseLabTokenDefaults,
        balance: 0n,
        calculateReservationCost: jest.fn(() => 0n),
        checkBalanceAndAllowance: jest.fn(() => ({
          hasSufficientBalance: false,
          hasSufficientAllowance: false,
        })),
      });

      render(<LabTokenInfo labPrice="100" durationMinutes={60} />);

      expect(screen.getByText(/0.*\$lab/i)).toBeInTheDocument();
    });

    test("handles null balance gracefully", () => {
      useLabToken.mockReturnValue({
        ...mockUseLabTokenDefaults,
        balance: null,
        calculateReservationCost: jest.fn(() => 0n),
        checkBalanceAndAllowance: jest.fn(() => ({
          hasSufficientBalance: false,
          hasSufficientAllowance: false,
        })),
      });

      render(<LabTokenInfo labPrice="100" durationMinutes={60} />);

      // Should default to 0 when balance is null
      expect(screen.getByText(/0.*\$lab/i)).toBeInTheDocument();
    });
  });

  describe("Reservation Cost Display", () => {
    test("displays reservation cost when duration is greater than zero", () => {
      useLabToken.mockReturnValue({
        ...mockUseLabTokenDefaults,
        calculateReservationCost: jest.fn(() => 2000000000000000000n), // 2 tokens
        checkBalanceAndAllowance: jest.fn(() => ({
          hasSufficientBalance: true,
          hasSufficientAllowance: true,
        })),
      });

      render(<LabTokenInfo labPrice="100" durationMinutes={60} />);

      expect(screen.getByText(/reservation cost:/i)).toBeInTheDocument();
      expect(screen.getByText(/2.*\$lab/i)).toBeInTheDocument();
    });

    test("hides reservation cost when cost is zero", () => {
      useLabToken.mockReturnValue({
        ...mockUseLabTokenDefaults,
        calculateReservationCost: jest.fn(() => 0n),
        checkBalanceAndAllowance: jest.fn(() => ({
          hasSufficientBalance: true,
          hasSufficientAllowance: true,
        })),
      });

      render(<LabTokenInfo labPrice="0" durationMinutes={0} />);

      expect(screen.queryByText(/reservation cost:/i)).not.toBeInTheDocument();
    });

    test("calls calculateReservationCost with correct parameters", () => {
      const mockCalculate = jest.fn(() => 1500000000000000000n);
      useLabToken.mockReturnValue({
        ...mockUseLabTokenDefaults,
        calculateReservationCost: mockCalculate,
        checkBalanceAndAllowance: jest.fn(() => ({
          hasSufficientBalance: true,
          hasSufficientAllowance: true,
        })),
      });

      render(<LabTokenInfo labPrice="150" durationMinutes={90} />);

      expect(mockCalculate).toHaveBeenCalledWith("150", 90);
    });
  });

  describe("Balance Status Indicators", () => {
    test("shows green indicator when balance is sufficient", () => {
      useLabToken.mockReturnValue({
        ...mockUseLabTokenDefaults,
        calculateReservationCost: jest.fn(() => 1000000000000000000n),
        checkBalanceAndAllowance: jest.fn(() => ({
          hasSufficientBalance: true,
          hasSufficientAllowance: true,
        })),
      });

      render(<LabTokenInfo labPrice="100" durationMinutes={60} />);

      expect(screen.getByText(/sufficient balance/i)).toBeInTheDocument();
      expect(screen.getByText(/sufficient balance/i)).toHaveClass(
        "text-green-400"
      );
    });

    test("shows red indicator when balance is insufficient", () => {
      useLabToken.mockReturnValue({
        ...mockUseLabTokenDefaults,
        balance: 500000000000000000n, // 0.5 tokens
        calculateReservationCost: jest.fn(() => 2000000000000000000n), // 2 tokens needed
        checkBalanceAndAllowance: jest.fn(() => ({
          hasSufficientBalance: false,
          hasSufficientAllowance: true,
        })),
      });

      render(<LabTokenInfo labPrice="200" durationMinutes={60} />);

      expect(screen.getByText(/insufficient balance/i)).toBeInTheDocument();
      expect(screen.getByText(/insufficient balance/i)).toHaveClass(
        "text-red-400"
      );
    });
  });

  describe("Approval Status Indicators", () => {
    test("shows green indicator when tokens are approved", () => {
      useLabToken.mockReturnValue({
        ...mockUseLabTokenDefaults,
        calculateReservationCost: jest.fn(() => 1000000000000000000n),
        checkBalanceAndAllowance: jest.fn(() => ({
          hasSufficientBalance: true,
          hasSufficientAllowance: true,
        })),
      });

      render(<LabTokenInfo labPrice="100" durationMinutes={60} />);

      expect(screen.getByText(/tokens approved/i)).toBeInTheDocument();
      expect(screen.getByText(/tokens approved/i)).toHaveClass(
        "text-green-400"
      );
    });

    test("shows yellow indicator when approval is required", () => {
      useLabToken.mockReturnValue({
        ...mockUseLabTokenDefaults,
        calculateReservationCost: jest.fn(() => 1000000000000000000n),
        checkBalanceAndAllowance: jest.fn(() => ({
          hasSufficientBalance: true,
          hasSufficientAllowance: false,
        })),
      });

      render(<LabTokenInfo labPrice="100" durationMinutes={60} />);

      expect(screen.getByText(/approval required/i)).toBeInTheDocument();
      expect(screen.getByText(/approval required/i)).toHaveClass(
        "text-yellow-400"
      );
    });
  });

  describe("Conditional Rendering", () => {
    // Indicators only shown when there's an actual cost to display
    test("hides status indicators when reservation cost is zero", () => {
      useLabToken.mockReturnValue({
        ...mockUseLabTokenDefaults,
        calculateReservationCost: jest.fn(() => 0n),
        checkBalanceAndAllowance: jest.fn(() => ({
          hasSufficientBalance: true,
          hasSufficientAllowance: true,
        })),
      });

      render(<LabTokenInfo labPrice="0" durationMinutes={0} />);

      expect(screen.queryByText(/sufficient balance/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/tokens approved/i)).not.toBeInTheDocument();
    });

    test("shows all indicators when reservation cost is greater than zero", () => {
      useLabToken.mockReturnValue({
        ...mockUseLabTokenDefaults,
        calculateReservationCost: jest.fn(() => 1000000000000000000n),
        checkBalanceAndAllowance: jest.fn(() => ({
          hasSufficientBalance: true,
          hasSufficientAllowance: true,
        })),
      });

      render(<LabTokenInfo labPrice="100" durationMinutes={60} />);

      expect(screen.getByText(/reservation cost:/i)).toBeInTheDocument();
      expect(screen.getByText(/sufficient balance/i)).toBeInTheDocument();
      expect(screen.getByText(/tokens approved/i)).toBeInTheDocument();
    });
  });

  describe("Styling and Props", () => {
    test("applies custom className", () => {
      useLabToken.mockReturnValue({
        ...mockUseLabTokenDefaults,
        calculateReservationCost: jest.fn(() => 0n),
        checkBalanceAndAllowance: jest.fn(() => ({
          hasSufficientBalance: true,
          hasSufficientAllowance: true,
        })),
      });

      const { container } = render(
        <LabTokenInfo
          labPrice="100"
          durationMinutes={60}
          className="custom-class"
        />
      );

      const mainDiv = container.firstChild;
      expect(mainDiv).toHaveClass("custom-class");
      expect(mainDiv).toHaveClass("bg-gray-700");
    });

    test("applies default className when not provided", () => {
      useLabToken.mockReturnValue({
        ...mockUseLabTokenDefaults,
        calculateReservationCost: jest.fn(() => 0n),
        checkBalanceAndAllowance: jest.fn(() => ({
          hasSufficientBalance: true,
          hasSufficientAllowance: true,
        })),
      });

      const { container } = render(
        <LabTokenInfo labPrice="100" durationMinutes={60} />
      );

      const mainDiv = container.firstChild;
      expect(mainDiv).toHaveClass("bg-gray-700");
    });
  });

  describe("Edge Cases", () => {
    test("handles string labPrice", () => {
      const mockCalculate = jest.fn(() => 1000000000000000000n);
      useLabToken.mockReturnValue({
        ...mockUseLabTokenDefaults,
        calculateReservationCost: mockCalculate,
        checkBalanceAndAllowance: jest.fn(() => ({
          hasSufficientBalance: true,
          hasSufficientAllowance: true,
        })),
      });

      render(<LabTokenInfo labPrice="100" durationMinutes={60} />);

      expect(mockCalculate).toHaveBeenCalledWith("100", 60);
    });

    test("handles numeric labPrice", () => {
      const mockCalculate = jest.fn(() => 1000000000000000000n);
      useLabToken.mockReturnValue({
        ...mockUseLabTokenDefaults,
        calculateReservationCost: mockCalculate,
        checkBalanceAndAllowance: jest.fn(() => ({
          hasSufficientBalance: true,
          hasSufficientAllowance: true,
        })),
      });

      render(<LabTokenInfo labPrice={100} durationMinutes={60} />);

      expect(mockCalculate).toHaveBeenCalledWith(100, 60);
    });

    test("handles very large token amounts", () => {
      useLabToken.mockReturnValue({
        ...mockUseLabTokenDefaults,
        balance: 1000000000000000000000n, // 1000 tokens
        calculateReservationCost: jest.fn(() => 500000000000000000000n), // 500 tokens
        checkBalanceAndAllowance: jest.fn(() => ({
          hasSufficientBalance: true,
          hasSufficientAllowance: true,
        })),
        formatTokenAmount: jest.fn((amount) => {
          if (typeof amount === "bigint") {
            return (Number(amount) / 1e18).toFixed(0);
          }
          return "0";
        }),
      });

      render(<LabTokenInfo labPrice="500" durationMinutes={60} />);

      expect(screen.getByText(/1000.*\$lab/i)).toBeInTheDocument();
      expect(screen.getByText(/500.*\$lab/i)).toBeInTheDocument();
    });

    test("handles both insufficient balance and missing approval", () => {
      useLabToken.mockReturnValue({
        ...mockUseLabTokenDefaults,
        balance: 500000000000000000n, // 0.5 tokens
        calculateReservationCost: jest.fn(() => 2000000000000000000n), // 2 tokens needed
        checkBalanceAndAllowance: jest.fn(() => ({
          hasSufficientBalance: false,
          hasSufficientAllowance: false,
        })),
      });

      render(<LabTokenInfo labPrice="200" durationMinutes={60} />);

      expect(screen.getByText(/insufficient balance/i)).toBeInTheDocument();
      expect(screen.getByText(/approval required/i)).toBeInTheDocument();
    });
  });
});
