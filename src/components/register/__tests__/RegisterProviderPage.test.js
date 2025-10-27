/**
 * Unit Tests for RegisterProviderPage Component
 *
 * Tests the registration page access control and routing logic for provider registration.
 * Validates role-based access control, loading states, and conditional rendering.
 *
 * Testing Behaviors:
 * - Loading States - Shows appropriate loading UI while fetching user/wallet data
 * - SSO Role Validation - Validates provider roles for SSO users
 * - Access Denied Flow - Renders access denied page for invalid roles
 * - Registration Form Flow - Shows registration form for valid users
 * - Wallet User Flow - Allows wallet users to access registration directly
 *
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import RegisterProviderPage from "../RegisterProviderPage";
import { useUser } from "@/context/UserContext";
import { validateProviderRole } from "@/utils/auth/roleValidation";

// Mock dependencies
jest.mock("@/context/UserContext");
jest.mock("@/utils/auth/roleValidation");
jest.mock("@/components/ui", () => ({
  Container: ({ children, className }) => (
    <div data-testid="container" className={className}>
      {children}
    </div>
  ),
}));
jest.mock("../ProviderAccessDenied", () => {
  return function MockProviderAccessDenied({ reason, userRole, scopedRole }) {
    return (
      <div data-testid="access-denied">
        <span>Access Denied</span>
        <span data-testid="denial-reason">{reason}</span>
        <span data-testid="user-role">{userRole}</span>
        <span data-testid="scoped-role">{scopedRole}</span>
      </div>
    );
  };
});
jest.mock("../ProviderRegisterForm", () => {
  return function MockProviderRegisterForm() {
    return <div data-testid="register-form">Provider Registration Form</div>;
  };
});

const mockUseUser = useUser;
const mockValidateProviderRole = validateProviderRole;

describe("RegisterProviderPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Loading States Tests
  describe("Loading States", () => {
    test("shows loading state when user data is loading", () => {
      mockUseUser.mockReturnValue({
        isSSO: false,
        user: null,
        isLoading: true,
        isWalletLoading: false,
      });

      render(<RegisterProviderPage />);

      expect(screen.getByText("Loading...")).toBeInTheDocument();
      expect(screen.getByTestId("container")).toHaveClass("text-center");
    });

    test("shows loading state when wallet is loading", () => {
      mockUseUser.mockReturnValue({
        isSSO: false,
        user: null,
        isLoading: false,
        isWalletLoading: true,
      });

      render(<RegisterProviderPage />);

      expect(screen.getByText("Loading...")).toBeInTheDocument();
    });

    test("shows loading state when both user and wallet are loading", () => {
      mockUseUser.mockReturnValue({
        isSSO: true,
        user: null,
        isLoading: true,
        isWalletLoading: true,
      });

      render(<RegisterProviderPage />);

      expect(screen.getByText("Loading...")).toBeInTheDocument();
    });
  });

  // SSO User - Permission Validation Tests

  describe("SSO User - Permission Validation", () => {
    test("shows validating permissions message for SSO user without loaded user data", () => {
      mockUseUser.mockReturnValue({
        isSSO: true,
        user: null,
        isLoading: false,
        isWalletLoading: false,
      });

      render(<RegisterProviderPage />);

      expect(screen.getByText("Validating permissions...")).toBeInTheDocument();
      expect(screen.queryByTestId("register-form")).not.toBeInTheDocument();
    });

    test("validates provider role for SSO user with loaded data", () => {
      const mockUser = {
        role: "admin",
        scopedRole: "provider",
      };
      mockUseUser.mockReturnValue({
        isSSO: true,
        user: mockUser,
        isLoading: false,
        isWalletLoading: false,
      });
      mockValidateProviderRole.mockReturnValue({
        isValid: true,
        reason: null,
      });

      render(<RegisterProviderPage />);

      expect(mockValidateProviderRole).toHaveBeenCalledWith(
        "admin",
        "provider"
      );
      expect(mockValidateProviderRole).toHaveBeenCalledTimes(1);
    });

    test("renders registration form when SSO user has valid provider role", () => {
      mockUseUser.mockReturnValue({
        isSSO: true,
        user: { role: "admin", scopedRole: "provider" },
        isLoading: false,
        isWalletLoading: false,
      });
      mockValidateProviderRole.mockReturnValue({
        isValid: true,
        reason: null,
      });

      render(<RegisterProviderPage />);

      expect(screen.getByTestId("register-form")).toBeInTheDocument();
      expect(screen.queryByTestId("access-denied")).not.toBeInTheDocument();
    });

    test("renders access denied when SSO user has invalid role", () => {
      const mockUser = {
        role: "user",
        scopedRole: null,
      };
      mockUseUser.mockReturnValue({
        isSSO: true,
        user: mockUser,
        isLoading: false,
        isWalletLoading: false,
      });
      mockValidateProviderRole.mockReturnValue({
        isValid: false,
        reason: "Insufficient permissions",
      });

      render(<RegisterProviderPage />);

      expect(screen.getByTestId("access-denied")).toBeInTheDocument();
      expect(screen.getByText("Access Denied")).toBeInTheDocument();
      expect(screen.queryByTestId("register-form")).not.toBeInTheDocument();
    });

    test("passes correct props to ProviderAccessDenied component", () => {
      const mockUser = {
        role: "viewer",
        scopedRole: "guest",
      };
      mockUseUser.mockReturnValue({
        isSSO: true,
        user: mockUser,
        isLoading: false,
        isWalletLoading: false,
      });
      mockValidateProviderRole.mockReturnValue({
        isValid: false,
        reason: "Invalid role assignment",
      });

      render(<RegisterProviderPage />);

      expect(screen.getByTestId("denial-reason")).toHaveTextContent(
        "Invalid role assignment"
      );
      expect(screen.getByTestId("user-role")).toHaveTextContent("viewer");
      expect(screen.getByTestId("scoped-role")).toHaveTextContent("guest");
    });
  });

  // Wallet User (Non-SSO) Tests

  describe("Wallet User (Non-SSO)", () => {
    test("renders registration form for wallet user directly without validation", () => {
      mockUseUser.mockReturnValue({
        isSSO: false,
        user: null,
        isLoading: false,
        isWalletLoading: false,
      });

      render(<RegisterProviderPage />);

      expect(screen.getByTestId("register-form")).toBeInTheDocument();
      expect(mockValidateProviderRole).not.toHaveBeenCalled();
    });

    test("does not call validateProviderRole for wallet users", () => {
      mockUseUser.mockReturnValue({
        isSSO: false,
        user: { role: "user", scopedRole: null },
        isLoading: false,
        isWalletLoading: false,
      });

      render(<RegisterProviderPage />);

      expect(mockValidateProviderRole).not.toHaveBeenCalled();
      expect(screen.getByTestId("register-form")).toBeInTheDocument();
    });
  });

  // Edge Cases

  describe("Edge Cases", () => {
    test("handles SSO user with undefined role gracefully", () => {
      mockUseUser.mockReturnValue({
        isSSO: true,
        user: { role: undefined, scopedRole: undefined },
        isLoading: false,
        isWalletLoading: false,
      });
      mockValidateProviderRole.mockReturnValue({
        isValid: false,
        reason: "No role defined",
      });

      render(<RegisterProviderPage />);

      expect(mockValidateProviderRole).toHaveBeenCalledWith(
        undefined,
        undefined
      );
      expect(screen.getByTestId("access-denied")).toBeInTheDocument();
    });

    test("prioritizes loading state over permission validation", () => {
      //  user is SSO but still loading
      mockUseUser.mockReturnValue({
        isSSO: true,
        user: { role: "admin", scopedRole: "provider" },
        isLoading: true,
        isWalletLoading: false,
      });

      render(<RegisterProviderPage />);

      expect(screen.getByText("Loading...")).toBeInTheDocument();
      expect(mockValidateProviderRole).not.toHaveBeenCalled();
      expect(screen.queryByTestId("register-form")).not.toBeInTheDocument();
    });

    test("shows permission validation before registration form for SSO", () => {
      // SSO user, not loading, but no user data yet
      mockUseUser.mockReturnValue({
        isSSO: true,
        user: null,
        isLoading: false,
        isWalletLoading: false,
      });

      render(<RegisterProviderPage />);

      expect(screen.getByText("Validating permissions...")).toBeInTheDocument();
      expect(screen.queryByTestId("register-form")).not.toBeInTheDocument();
      expect(mockValidateProviderRole).not.toHaveBeenCalled();
    });
  });
});
