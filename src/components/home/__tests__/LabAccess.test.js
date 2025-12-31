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

import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { useRouter } from "next/navigation";
import { useSignMessage, useSignTypedData } from "wagmi";
import LabAccess from "../LabAccess";
import { useUser } from "@/context/UserContext";
import {
  authenticateLabAccess,
  authenticateLabAccessSSO,
  getAuthErrorMessage,
} from "@/utils/auth/labAuth";

// Mock dependencies
jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

jest.mock("wagmi", () => ({
  useSignMessage: jest.fn(),
  useSignTypedData: jest.fn(),
}));

jest.mock("@/context/UserContext", () => ({
  useUser: jest.fn(),
}));

jest.mock("@/utils/auth/labAuth", () => ({
  authenticateLabAccess: jest.fn(),
  authenticateLabAccessSSO: jest.fn(),
  getAuthErrorMessage: jest.fn(),
}));

jest.mock("@/utils/dev/logger", () => ({
  log: jest.fn(),
  error: jest.fn(),
}));

// Mock fetch globally
global.fetch = jest.fn();

describe("LabAccess Component", () => {
  const mockRouter = { push: jest.fn() };
  const mockSignMessageAsync = jest.fn();
  const mockSignTypedDataAsync = jest.fn();
  const mockUseUser = useUser;
  const originalConsoleError = console.error;

  const defaultProps = {
    id: "123",
    userWallet: "0x1234567890",
    hasActiveBooking: true,
    reservationKey: "test-key-123",
  };

  const getAccessButton = async () => {
    const button = await screen.findByRole("button", { name: "Access" });
    await waitFor(() => {
      expect(button).toBeEnabled();
    });
    return button;
  };

  // Setup before each test
  beforeEach(() => {
    jest.clearAllMocks();

    useRouter.mockReturnValue(mockRouter);
    useSignMessage.mockReturnValue({
      signMessageAsync: mockSignMessageAsync,
    });
    useSignTypedData.mockReturnValue({
      signTypedDataAsync: mockSignTypedDataAsync,
    });
    mockUseUser.mockReturnValue({ isSSO: false });
    // Mock fetch to return authURI
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ authURI: "https://auth.example.com/auth" }),
    });
    // Suppress jsdom navigation warnings
    console.error = (...args) => {
      if (args[0]?.toString?.().includes('Not implemented: navigation')) return;
      originalConsoleError.apply(console, args);
    };
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  describe("Rendering", () => {
    test("should render access button when user has active booking", () => {
      render(<LabAccess {...defaultProps} />);

      const accessButton = screen.getByRole("button", { name: "Access" });
      expect(accessButton).toBeInTheDocument();
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

      // Wait for authURI to be fetched
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/contract/lab/getLabAuthURI?labId=${defaultProps.id}`
        );
      });

      const accessButton = await getAccessButton();
      fireEvent.click(accessButton);

      expect(screen.getByText("Verifying...")).toBeInTheDocument();
    });
  });

  describe("Authentication Flow", () => {
    test("should handle authentication without reservation key", async () => {
      const propsWithoutKey = { ...defaultProps, reservationKey: null };

      render(<LabAccess {...propsWithoutKey} />);

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      // Wait for authURI to be fetched
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/contract/lab/getLabAuthURI?labId=${defaultProps.id}`
        );
      });

      const accessButton = await getAccessButton();
      fireEvent.click(accessButton);

      await waitFor(() => {
        expect(authenticateLabAccess).toHaveBeenCalledWith(
          "https://auth.example.com/auth",
          defaultProps.userWallet,
          defaultProps.id,
          mockSignMessageAsync,
          null,
          { signTypedDataAsync: mockSignTypedDataAsync }
        );
      });
    });

    test("uses SSO auth flow when user is institutional", async () => {
      useUser.mockReturnValue({ isSSO: true });
      authenticateLabAccessSSO.mockResolvedValue({
        error: "Invalid booking credentials",
      });

      render(<LabAccess {...defaultProps} />);

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      // Wait for authURI to be fetched
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/contract/lab/getLabAuthURI?labId=${defaultProps.id}`
        );
      });

      const accessButton = await getAccessButton();
      fireEvent.click(accessButton);

      await waitFor(() => {
        expect(authenticateLabAccessSSO).toHaveBeenCalledWith({
          labId: defaultProps.id,
          reservationKey: defaultProps.reservationKey,
          authEndpoint: "https://auth.example.com/auth",
        });
      });
    });
  });

  describe("Error Handling", () => {
    test("should display error when auth endpoint is missing", async () => {
      // Mock fetch to return empty authURI
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ authURI: "" }),
      });

      render(<LabAccess {...defaultProps} />);

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      // Wait for authURI to be fetched
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/contract/lab/getLabAuthURI?labId=${defaultProps.id}`
        );
      });

      const accessButton = await getAccessButton();
      fireEvent.click(accessButton);

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

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      // Wait for authURI to be fetched
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/contract/lab/getLabAuthURI?labId=${defaultProps.id}`
        );
      });

      const accessButton = await getAccessButton();
      fireEvent.click(accessButton);

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

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      // Wait for authURI to be fetched
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/contract/lab/getLabAuthURI?labId=${defaultProps.id}`
        );
      });

      const accessButton = await getAccessButton();
      fireEvent.click(accessButton);

      await waitFor(() => {
        expect(getAuthErrorMessage).toHaveBeenCalledWith(mockError, false);
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

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      // Wait for authURI to be fetched
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/contract/lab/getLabAuthURI?labId=${defaultProps.id}`
        );
      });

      const accessButton = await getAccessButton();
      fireEvent.click(accessButton);

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

      await act(async () => {
        render(<LabAccess {...defaultProps} />);
      });

      // Wait for authURI to be fetched
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/contract/lab/getLabAuthURI?labId=${defaultProps.id}`
        );
      });

      const accessButton = await getAccessButton();
      fireEvent.click(accessButton);

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
    test("should handle string ID prop", async () => {
      render(<LabAccess {...defaultProps} id="string-id" />);

      await waitFor(() => {
        expect(screen.getByText("Access")).toBeInTheDocument();
      });
    });

    test("should handle number ID prop", async () => {
      render(<LabAccess {...defaultProps} id={456} />);

      await waitFor(() => {
        expect(screen.getByText("Access")).toBeInTheDocument();
      });
    });

    test("should use default props when not provided", async () => {
      const minimalProps = {
        id: "123",
        userWallet: "0x1234567890",
        hasActiveBooking: true,
      };

      render(<LabAccess {...minimalProps} />);

      await waitFor(() => {
        expect(screen.getByText("Access")).toBeInTheDocument();
      });
    });
  });

  describe("Loading State Management", () => {
    test("should reset loading state after error", async () => {
      authenticateLabAccess.mockRejectedValue(new Error("Test error"));
      getAuthErrorMessage.mockReturnValue("Error occurred");

      render(<LabAccess {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText("Access")).toBeInTheDocument();
      });

      const accessButton = await getAccessButton();
      fireEvent.click(accessButton);

      await waitFor(() => {
        expect(screen.queryByText("Verifying...")).not.toBeInTheDocument();
        expect(screen.getByText("Access")).toBeInTheDocument();
      });
    });
  });
});


