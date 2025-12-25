/**
 * Unit Tests for RegisterPage Component
 *
 * Tests the registration page access control and routing logic for provider registration.
 * Validates role-based access control, loading states, and conditional rendering.
 *
 * Tests Behaviors:
 * - Loading States - Shows appropriate loading UI while fetching user/wallet data
 * - SSO Admin Role Validation - Uses hasAdminRole to grant institution-level access
 * - Access Denied Flow - Renders access denied page for non-admin SSO users
 * - Institution Choice Flow - Shows Consumer/Provider cards for authorized SSO users
 * - Wallet User Flow - Allows wallet users to access registration directly
 *
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import RegisterPage from "../RegisterPage";
import { useUser } from "@/context/UserContext";
import { hasAdminRole } from "@/utils/auth/roleValidation";

// Mock dependencies
jest.mock("@/context/UserContext");
jest.mock("@/context/NotificationContext", () => ({
  useNotifications: () => ({
    addErrorNotification: jest.fn(),
    addSuccessNotification: jest.fn(),
  }),
}));
jest.mock("@/utils/auth/roleValidation");

// Mock FontAwesome
jest.mock("@fortawesome/react-fontawesome", () => ({
  FontAwesomeIcon: () => <span data-testid="font-awesome-icon" />,
}));

// Mock UI Container and Button
jest.mock("@/components/ui", () => ({
  Container: ({ children, className }) => (
    <div data-testid="container" className={className}>
      {children}
    </div>
  ),
  Button: ({ children, onClick, className }) => (
    <button data-testid="mock-button" onClick={onClick} className={className}>
      {children}
    </button>
  ),
}));

// Mock Sibling Components
jest.mock("../ProviderAccessDenied", () => {
  return function MockProviderAccessDenied({ reason, userRole, scopedRole }) {
    return (
      <div data-testid="access-denied">
        <span>Access Denied</span>
        <span data-testid="denial-reason">{reason}</span>
        {userRole && <span data-testid="user-role">{userRole}</span>}
        {scopedRole && <span data-testid="scoped-role">{scopedRole}</span>}
      </div>
    );
  };
});

jest.mock("../ProviderRegisterForm", () => {
  return function MockProviderRegisterForm() {
    return <div data-testid="register-form">Provider Registration Form</div>;
  };
});

jest.mock("@/components/dashboard/user/InstitutionInviteCard", () => ({
  __esModule: true,
  default: () => (
    <div data-testid="institution-invite-card">Institution Invite Card</div>
  ),
}));

jest.mock("../InstitutionProviderRegister", () => ({
  __esModule: true,
  default: () => (
    <div data-testid="institution-provider-register">
      Institution Provider Register
    </div>
  ),
}));

const mockUseUser = useUser;
const mockHasAdminRole = hasAdminRole;

describe("RegisterPage", () => {
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

      render(<RegisterPage />);

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

      render(<RegisterPage />);

      expect(screen.getByText("Loading...")).toBeInTheDocument();
    });

    test("shows loading state when both user and wallet are loading", () => {
      mockUseUser.mockReturnValue({
        isSSO: true,
        user: null,
        isLoading: true,
        isWalletLoading: true,
      });

      render(<RegisterPage />);

      expect(screen.getByText("Loading...")).toBeInTheDocument();
    });
  });

  // SSO User - Admin Role Validation Tests
  describe("SSO User - Admin Role Validation", () => {
    test("shows validating permissions message for SSO user without loaded user data", () => {
      mockUseUser.mockReturnValue({
        isSSO: true,
        user: null,
        isLoading: false,
        isWalletLoading: false,
      });

      render(<RegisterPage />);

      expect(screen.getByText("Validating permissions...")).toBeInTheDocument();
      expect(screen.queryByTestId("register-form")).not.toBeInTheDocument();
    });

    test("calls hasAdminRole for SSO user with loaded data", () => {
      const mockUser = {
        role: "faculty",
        scopedRole: "staff",
      };
      mockUseUser.mockReturnValue({
        isSSO: true,
        user: mockUser,
        isLoading: false,
        isWalletLoading: false,
      });

      render(<RegisterPage />);

      expect(mockHasAdminRole).toHaveBeenCalledWith("faculty", "staff");
      expect(mockHasAdminRole).toHaveBeenCalledTimes(1);
    });

    test("shows institution choice cards when SSO user has admin privileges", () => {
      mockUseUser.mockReturnValue({
        isSSO: true,
        user: { role: "employee", scopedRole: "" },
        isLoading: false,
        isWalletLoading: false,
      });
      mockHasAdminRole.mockReturnValue(true);

      render(<RegisterPage />);

      expect(
        screen.getByText(/Choose how your institution wants to participate/i)
      ).toBeInTheDocument();
      expect(screen.queryByTestId("register-form")).not.toBeInTheDocument();
      expect(screen.queryByTestId("access-denied")).not.toBeInTheDocument();
    });

    test("renders access denied when SSO user does not have admin privileges", () => {
      mockUseUser.mockReturnValue({
        isSSO: true,
        user: { role: "student", scopedRole: "learner" },
        isLoading: false,
        isWalletLoading: false,
      });
      mockHasAdminRole.mockReturnValue(false);

      render(<RegisterPage />);

      expect(screen.getByTestId("access-denied")).toBeInTheDocument();
      expect(screen.getByText("Access Denied")).toBeInTheDocument();
      expect(screen.queryByTestId("register-form")).not.toBeInTheDocument();
    });

    test("passes correct denial reason and role info to ProviderAccessDenied", () => {
      mockUseUser.mockReturnValue({
        isSSO: true,
        user: { role: "alum", scopedRole: "former-student" },
        isLoading: false,
        isWalletLoading: false,
      });
      mockHasAdminRole.mockReturnValue(false);

      render(<RegisterPage />);

      expect(screen.getByTestId("denial-reason")).toHaveTextContent(
        "Your institutional role does not allow institution-level registration. Only staff, employees, or faculty can register an institution."
      );
      expect(screen.getByTestId("user-role")).toHaveTextContent("alum");
      expect(screen.getByTestId("scoped-role")).toHaveTextContent(
        "former-student"
      );
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

      render(<RegisterPage />);

      expect(screen.getByTestId("register-form")).toBeInTheDocument();
      expect(mockHasAdminRole).not.toHaveBeenCalled();
    });

    test("does not call hasAdminRole for wallet users", () => {
      mockUseUser.mockReturnValue({
        isSSO: false,
        user: { role: "any", scopedRole: "any" },
        isLoading: false,
        isWalletLoading: false,
      });

      render(<RegisterPage />);

      expect(mockHasAdminRole).not.toHaveBeenCalled();
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
      mockHasAdminRole.mockReturnValue(false);

      render(<RegisterPage />);

      expect(mockHasAdminRole).toHaveBeenCalledWith(undefined, undefined);
      expect(screen.getByTestId("access-denied")).toBeInTheDocument();
    });

    test("prioritizes loading state over permission validation", () => {
      mockUseUser.mockReturnValue({
        isSSO: true,
        user: { role: "faculty", scopedRole: "staff" },
        isLoading: true,
        isWalletLoading: false,
      });

      render(<RegisterPage />);

      expect(screen.getByText("Loading...")).toBeInTheDocument();
      expect(mockHasAdminRole).not.toHaveBeenCalled();
      expect(screen.queryByTestId("register-form")).not.toBeInTheDocument();
    });

    test("shows permission validation before institution flow for SSO", () => {
      mockUseUser.mockReturnValue({
        isSSO: true,
        user: null,
        isLoading: false,
        isWalletLoading: false,
      });

      render(<RegisterPage />);

      expect(screen.getByText("Validating permissions...")).toBeInTheDocument();
      expect(screen.queryByTestId("register-form")).not.toBeInTheDocument();
      expect(mockHasAdminRole).not.toHaveBeenCalled();
    });
  });
});
