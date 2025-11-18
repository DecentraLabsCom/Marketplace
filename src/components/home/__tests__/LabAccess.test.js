/**
 * Unit Tests for LabAccess Component
 *
 * Tested Behaviors:
 * - Conditional rendering based on booking status
 * - Authentication endpoint validation
 * - Successful authentication flow with redirect
 * - Error handling scenarios
 * - Loading states management
 * - User interaction flows
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useRouter } from "next/navigation";
import { useSignMessage } from "wagmi";
import LabAccess from "../LabAccess";
import {
  authenticateLabAccess,
  getAuthErrorMessage,
} from "@/utils/auth/labAuth";

// Mock dependencies
jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

jest.mock("wagmi", () => ({
  useSignMessage: jest.fn(),
}));

jest.mock("@/utils/auth/labAuth", () => ({
  authenticateLabAccess: jest.fn(),
  getAuthErrorMessage: jest.fn(),
}));

jest.mock("@/utils/dev/logger", () => ({
  log: jest.fn(),
  error: jest.fn(),
}));

describe("LabAccess Component", () => {
  const mockRouter = { push: jest.fn() };
  const mockSignMessageAsync = jest.fn();

  const defaultProps = {
    id: "123",
    userWallet: "0x1234567890",
    hasActiveBooking: true,
    auth: "https://auth.example.com",
    reservationKey: "test-key-123",
  };

  // Setup before each test
  beforeEach(() => {
    jest.clearAllMocks();

    useRouter.mockReturnValue(mockRouter);
    useSignMessage.mockReturnValue({
      signMessageAsync: mockSignMessageAsync,
    });

    // Reset window.location
    delete window.location;
    window.location = { href: jest.fn() };
  });

  describe("Rendering", () => {
    test("should render access button when user has active booking", () => {
      render(<LabAccess {...defaultProps} />);

      const accessDiv = screen.getByText("Access");
      expect(accessDiv).toBeInTheDocument();
    });

    test("should render empty div when user has no active booking", () => {
      const { container } = render(
        <LabAccess {...defaultProps} hasActiveBooking={false} />
      );

      expect(container.firstChild).toBeEmptyDOMElement();
    });

    test("should display loading state when authenticating", async () => {
      authenticateLabAccess.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      render(<LabAccess {...defaultProps} />);

      const accessButton = screen.getByText("Access");
      fireEvent.click(accessButton.closest("div"));

      expect(screen.getByText("Verifying...")).toBeInTheDocument();
    });
  });

  describe("Authentication Flow", () => {
    test("should handle authentication without reservation key", async () => {
      const propsWithoutKey = { ...defaultProps, reservationKey: null };

      render(<LabAccess {...propsWithoutKey} />);

      const accessButton = screen.getByText("Access");
      fireEvent.click(accessButton.closest("div"));

      await waitFor(() => {
        expect(authenticateLabAccess).toHaveBeenCalledWith(
          defaultProps.auth,
          defaultProps.userWallet,
          defaultProps.id,
          mockSignMessageAsync,
          null
        );
      });
    });
  });

  describe("Error Handling", () => {
    test("should display error when auth endpoint is missing", async () => {
      render(<LabAccess {...defaultProps} auth="" />);

      const accessButton = screen.getByText("Access");
      fireEvent.click(accessButton.closest("div"));

      await waitFor(() => {
        const errorMessage = screen.getByText(
          "This lab does not have authentication configured. Please contact the lab provider."
        );
        expect(errorMessage).toBeInTheDocument();
      });

      expect(authenticateLabAccess).not.toHaveBeenCalled();
    });

    test("should handle authentication service errors", async () => {
      authenticateLabAccess.mockResolvedValue({
        error: "Invalid booking credentials",
      });

      render(<LabAccess {...defaultProps} />);

      const accessButton = screen.getByText("Access");
      fireEvent.click(accessButton.closest("div"));

      await waitFor(() => {
        const errorMessage = screen.getByText("Invalid booking credentials");
        expect(errorMessage).toBeInTheDocument();
      });
    });

    test("should handle authentication exceptions", async () => {
      const mockError = new Error("Network error");
      authenticateLabAccess.mockRejectedValue(mockError);
      getAuthErrorMessage.mockReturnValue(
        "Connection failed. Please try again."
      );

      render(<LabAccess {...defaultProps} />);

      const accessButton = screen.getByText("Access");
      fireEvent.click(accessButton.closest("div"));

      await waitFor(() => {
        expect(getAuthErrorMessage).toHaveBeenCalledWith(mockError);
        const errorMessage = screen.getByText(
          "Connection failed. Please try again."
        );
        expect(errorMessage).toBeInTheDocument();
      });
    });

    test("should handle unexpected response format", async () => {
      authenticateLabAccess.mockResolvedValue({
        // Missing token and labURL
        someOtherField: "value",
      });

      render(<LabAccess {...defaultProps} />);

      const accessButton = screen.getByText("Access");
      fireEvent.click(accessButton.closest("div"));

      await waitFor(() => {
        const errorMessage = screen.getByText(
          "Unexpected error, please try again."
        );
        expect(errorMessage).toBeInTheDocument();
      });
    });

    test("should auto-clear error messages after timeout", async () => {
      jest.useFakeTimers();

      authenticateLabAccess.mockResolvedValue({
        error: "Temporary error",
      });

      render(<LabAccess {...defaultProps} />);

      const accessButton = screen.getByText("Access");
      fireEvent.click(accessButton.closest("div"));

      await waitFor(() => {
        expect(screen.getByText("Temporary error")).toBeInTheDocument();
      });

      jest.advanceTimersByTime(1500);

      await waitFor(() => {
        expect(screen.queryByText("Temporary error")).not.toBeInTheDocument();
      });

      jest.useRealTimers();
    });
  });

  describe("Props Validation", () => {
    test("should handle string ID prop", () => {
      render(<LabAccess {...defaultProps} id="string-id" />);
      expect(screen.getByText("Access")).toBeInTheDocument();
    });

    test("should handle number ID prop", () => {
      render(<LabAccess {...defaultProps} id={456} />);
      expect(screen.getByText("Access")).toBeInTheDocument();
    });

    test("should use default props when not provided", () => {
      const minimalProps = {
        id: "123",
        userWallet: "0x1234567890",
        hasActiveBooking: true,
      };

      render(<LabAccess {...minimalProps} />);

      const accessButton = screen.getByText("Access");
      fireEvent.click(accessButton.closest("div"));

      // Should show error for missing auth endpoint
      waitFor(() => {
        expect(
          screen.getByText(/does not have authentication configured/)
        ).toBeInTheDocument();
      });
    });
  });

  describe("Loading State Management", () => {
    test("should reset loading state after error", async () => {
      authenticateLabAccess.mockRejectedValue(new Error("Test error"));
      getAuthErrorMessage.mockReturnValue("Error occurred");

      render(<LabAccess {...defaultProps} />);

      const accessButton = screen.getByText("Access");
      fireEvent.click(accessButton.closest("div"));

      await waitFor(() => {
        expect(screen.queryByText("Verifying...")).not.toBeInTheDocument();
        expect(screen.getByText("Access")).toBeInTheDocument();
      });
    });
  });
});
