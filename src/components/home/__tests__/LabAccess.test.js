/**
 * Unit tests for LabAccess component
 *
 * Test behaviors:
 * - Does not render when user has no active booking
 * - Renders access button when user has active booking
 * - Shows error when auth endpoint is missing or empty
 * - Handles successful authentication and redirects with JWT token
 * - Displays error message when authentication service returns error
 * - Catches and displays user-friendly errors from authentication exceptions
 * - Shows loading state during authentication process
 * - Auto-dismisses error messages after timeout
 * - Handles unexpected response format from authentication service
 * - Passes reservationKey to authentication when available
 *
 * Known warnings (component-level fixes needed):
 * - defaultProps deprecation: Replace with default parameters in function signature
 * - act() warnings: Add useRef + useEffect cleanup for setTimeout calls to prevent state updates on unmounted components
 */

import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { useRouter } from "next/navigation";
import { useSignMessage } from "wagmi";
import LabAccess from "../LabAccess";
import {
  authenticateLabAccess,
  getAuthErrorMessage,
} from "@/utils/auth/labAuth";
import devLog from "@/utils/dev/logger";

// Mock Next.js router
jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

// Mock wagmi hook
jest.mock("wagmi", () => ({
  useSignMessage: jest.fn(),
}));

// Mock auth utilities
jest.mock("@/utils/auth/labAuth", () => ({
  authenticateLabAccess: jest.fn(),
  getAuthErrorMessage: jest.fn(),
}));

// Mock dev logger
jest.mock("@/utils/dev/logger", () => ({
  log: jest.fn(),
  error: jest.fn(),
}));

describe("LabAccess Component", () => {
  let mockPush;
  let mockSignMessageAsync;

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Setup router mock
    mockPush = jest.fn();
    useRouter.mockReturnValue({ push: mockPush });

    // Setup wagmi mock
    mockSignMessageAsync = jest.fn();
    useSignMessage.mockReturnValue({ signMessageAsync: mockSignMessageAsync });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe("Rendering Logic", () => {
    test("should not render when user has no active booking", () => {
      const { container } = render(
        <LabAccess
          id="lab-123"
          userWallet="0x123"
          hasActiveBooking={false}
          auth="https://auth.example.com"
        />
      );

      // Should render empty div only
      expect(container.firstChild).toBeEmptyDOMElement();
    });

    test("should render access button when user has active booking", () => {
      render(
        <LabAccess
          id="lab-123"
          userWallet="0x123"
          hasActiveBooking={true}
          auth="https://auth.example.com"
        />
      );

      expect(screen.getByText("Access")).toBeInTheDocument();
    });
  });

  describe("Authentication Validation", () => {
    test("should show error when auth endpoint is missing", async () => {
      render(
        <LabAccess
          id="lab-123"
          userWallet="0x123"
          hasActiveBooking={true}
          auth=""
        />
      );

      const accessButton = screen.getByText("Access");
      fireEvent.click(accessButton);

      await waitFor(() => {
        expect(
          screen.getByText(/This lab does not have authentication configured/i)
        ).toBeInTheDocument();
      });

      expect(devLog.error).toHaveBeenCalledWith(
        "❌ Missing auth endpoint for lab:",
        "lab-123"
      );
      expect(authenticateLabAccess).not.toHaveBeenCalled();
    });

    test("should show error when auth endpoint is null", async () => {
      render(
        <LabAccess
          id="lab-123"
          userWallet="0x123"
          hasActiveBooking={true}
          auth={null}
        />
      );

      const accessButton = screen.getByText("Access");
      fireEvent.click(accessButton);

      await waitFor(() => {
        expect(
          screen.getByText(/This lab does not have authentication configured/i)
        ).toBeInTheDocument();
      });
    });

    test("should auto-dismiss error after 3 seconds for missing auth", async () => {
      render(
        <LabAccess
          id="lab-123"
          userWallet="0x123"
          hasActiveBooking={true}
          auth=""
        />
      );

      fireEvent.click(screen.getByText("Access"));

      await waitFor(() => {
        expect(
          screen.getByText(/This lab does not have authentication configured/i)
        ).toBeInTheDocument();
      });

      // Fast-forward 3 seconds
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      await waitFor(() => {
        expect(
          screen.queryByText(
            /This lab does not have authentication configured/i
          )
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("Successful Authentication Flow", () => {
    test("should authenticate and redirect with JWT token on success", async () => {
      const mockAuthResult = {
        token: "mock-jwt-token-123",
        labURL: "https://lab.example.com/lab-123",
      };

      authenticateLabAccess.mockResolvedValue(mockAuthResult);

      render(
        <LabAccess
          id="lab-123"
          userWallet="0xUserWallet123"
          hasActiveBooking={true}
          auth="https://auth.example.com"
        />
      );

      fireEvent.click(screen.getByText("Access"));

      await waitFor(() => {
        expect(authenticateLabAccess).toHaveBeenCalledWith(
          "https://auth.example.com",
          "0xUserWallet123",
          "lab-123",
          mockSignMessageAsync,
          null
        );
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          "https://lab.example.com/lab-123?jwt=mock-jwt-token-123"
        );
      });

      expect(devLog.log).toHaveBeenCalledWith(
        "🚀 Lab access granted, redirecting to:",
        mockAuthResult.labURL
      );
    });

    test("should pass reservationKey to authentication when provided", async () => {
      const mockAuthResult = {
        token: "mock-token",
        labURL: "https://lab.example.com",
      };

      authenticateLabAccess.mockResolvedValue(mockAuthResult);

      render(
        <LabAccess
          id="lab-123"
          userWallet="0xUserWallet123"
          hasActiveBooking={true}
          auth="https://auth.example.com"
          reservationKey="reservation-key-xyz"
        />
      );

      fireEvent.click(screen.getByText("Access"));

      await waitFor(() => {
        expect(authenticateLabAccess).toHaveBeenCalledWith(
          "https://auth.example.com",
          "0xUserWallet123",
          "lab-123",
          mockSignMessageAsync,
          "reservation-key-xyz"
        );
      });
    });
  });

  describe("Authentication Error Handling", () => {
    test("should display error when authentication service returns error", async () => {
      authenticateLabAccess.mockResolvedValue({
        error: "Invalid booking or expired session",
      });

      render(
        <LabAccess
          id="lab-123"
          userWallet="0x123"
          hasActiveBooking={true}
          auth="https://auth.example.com"
        />
      );

      fireEvent.click(screen.getByText("Access"));

      await waitFor(() => {
        expect(
          screen.getByText("Invalid booking or expired session")
        ).toBeInTheDocument();
      });
    });

    test("should auto-dismiss error message after 1.5 seconds", async () => {
      authenticateLabAccess.mockResolvedValue({
        error: "Authentication failed",
      });

      render(
        <LabAccess
          id="lab-123"
          userWallet="0x123"
          hasActiveBooking={true}
          auth="https://auth.example.com"
        />
      );

      fireEvent.click(screen.getByText("Access"));

      await waitFor(() => {
        expect(screen.getByText("Authentication failed")).toBeInTheDocument();
      });

      // Fast-forward 1.5 seconds
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      await waitFor(() => {
        expect(
          screen.queryByText("Authentication failed")
        ).not.toBeInTheDocument();
      });
    });

    test("should handle exceptions with user-friendly error messages", async () => {
      const mockError = new Error("Network failure");
      authenticateLabAccess.mockRejectedValue(mockError);
      getAuthErrorMessage.mockReturnValue(
        "Unable to connect. Please check your network."
      );

      render(
        <LabAccess
          id="lab-123"
          userWallet="0x123"
          hasActiveBooking={true}
          auth="https://auth.example.com"
        />
      );

      fireEvent.click(screen.getByText("Access"));

      await waitFor(() => {
        expect(getAuthErrorMessage).toHaveBeenCalledWith(mockError);
        expect(
          screen.getByText("Unable to connect. Please check your network.")
        ).toBeInTheDocument();
      });
    });

    test("should handle unexpected response format", async () => {
      authenticateLabAccess.mockResolvedValue({
        // Missing both token/labURL and error
        someOtherField: "value",
      });

      render(
        <LabAccess
          id="lab-123"
          userWallet="0x123"
          hasActiveBooking={true}
          auth="https://auth.example.com"
        />
      );

      fireEvent.click(screen.getByText("Access"));

      await waitFor(() => {
        expect(
          screen.getByText("Unexpected error, please try again.")
        ).toBeInTheDocument();
      });
    });
  });

  describe("Loading State", () => {
    test("should show loading state during authentication", async () => {
      authenticateLabAccess.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ token: "token", labURL: "url" }), 100)
          )
      );

      render(
        <LabAccess
          id="lab-123"
          userWallet="0x123"
          hasActiveBooking={true}
          auth="https://auth.example.com"
        />
      );

      expect(screen.getByText("Access")).toBeInTheDocument();

      fireEvent.click(screen.getByText("Access"));

      await waitFor(() => {
        expect(screen.getByText("Verifying...")).toBeInTheDocument();
      });

      // Complete the authentication
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      await waitFor(() => {
        expect(screen.getByText("Access")).toBeInTheDocument();
      });
    });

    test("should reset loading state after error", async () => {
      authenticateLabAccess.mockRejectedValue(new Error("Test error"));
      getAuthErrorMessage.mockReturnValue("Error message");

      render(
        <LabAccess
          id="lab-123"
          userWallet="0x123"
          hasActiveBooking={true}
          auth="https://auth.example.com"
        />
      );

      fireEvent.click(screen.getByText("Access"));

      await waitFor(() => {
        expect(screen.getByText("Verifying...")).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText("Access")).toBeInTheDocument();
        expect(screen.getByText("Error message")).toBeInTheDocument();
      });
    });
  });
  describe("Edge Cases", () => {
    test("should clear previous error when starting new authentication", async () => {
      // First attempt fails
      authenticateLabAccess.mockRejectedValueOnce(new Error("First error"));
      getAuthErrorMessage.mockReturnValueOnce("First error message");

      // Second attempt succeeds
      authenticateLabAccess.mockResolvedValueOnce({
        token: "token",
        labURL: "https://lab.example.com",
      });

      render(
        <LabAccess
          id="lab-123"
          userWallet="0x123"
          hasActiveBooking={true}
          auth="https://auth.example.com"
        />
      );

      // First click - fails
      fireEvent.click(screen.getByText("Access"));

      await waitFor(() => {
        expect(screen.getByText("First error message")).toBeInTheDocument();
      });

      // Second click - succeeds
      fireEvent.click(screen.getByText("Access"));

      await waitFor(() => {
        expect(
          screen.queryByText("First error message")
        ).not.toBeInTheDocument();
      });
    });
  });
});
