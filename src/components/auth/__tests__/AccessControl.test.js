/**
 * Unit tests for AccessControl component
 *
 * Test Behaviors:
 * - Shows loading spinner during authentication checks
 * - Blocks access and shows messages when requirements not met
 * - Grants access when user meets auth requirements (basic/wallet/SSO)
 * - Grants provider access to: confirmed providers (wallet/SSO) and faculty (SSO)
 * - Detects faculty role from user.role or user.scopedRole (case-insensitive)
 * - Shows "Register as Provider" button only for wallet users
 * - Redirects to home when access denied (after loading completes)
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useUser } from "@/context/UserContext";
import { useRouter } from "next/navigation";
import AccessControl from "../AccessControl";

jest.mock("@/context/UserContext", () => ({
  useUser: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

describe("AccessControl", () => {
  const mockPush = jest.fn();
  const mockUserDefaults = {
    isLoggedIn: false,
    isSSO: false,
    isConnected: false,
    isLoading: false,
    isWalletLoading: false,
    isProvider: false,
    isProviderLoading: false,
    address: null,
    user: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useRouter.mockReturnValue({ push: mockPush });
    useUser.mockReturnValue(mockUserDefaults);
  });

  describe("Loading States", () => {
    test("displays loading state while checking wallet connection", () => {
      useUser.mockReturnValue({
        ...mockUserDefaults,
        isWalletLoading: true,
      });

      render(
        <AccessControl>
          <div>Protected Content</div>
        </AccessControl>
      );

      expect(screen.getByText(/connecting/i)).toBeInTheDocument();
      expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
    });

    test("displays loading state while checking user authentication", () => {
      useUser.mockReturnValue({
        ...mockUserDefaults,
        isLoading: true,
      });

      render(
        <AccessControl>
          <div>Protected Content</div>
        </AccessControl>
      );

      expect(screen.getByText(/connecting/i)).toBeInTheDocument();
      expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
    });
  });

  describe("Access Denied - General", () => {
    test("shows default access denied message", () => {
      render(
        <AccessControl>
          <div>Protected Content</div>
        </AccessControl>
      );

      expect(
        screen.getByText(/please log in to access this page/i)
      ).toBeInTheDocument();
      expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
    });

    test("shows custom access denied message", () => {
      render(
        <AccessControl message="Custom access message">
          <div>Protected Content</div>
        </AccessControl>
      );

      expect(screen.getByText("Custom access message")).toBeInTheDocument();
      expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
    });
  });

  describe("Access Granted - Basic Authentication", () => {
    test("renders children when user is logged in", () => {
      useUser.mockReturnValue({
        ...mockUserDefaults,
        isLoggedIn: true,
      });

      render(
        <AccessControl>
          <div>Protected Content</div>
        </AccessControl>
      );

      expect(screen.getByText("Protected Content")).toBeInTheDocument();
    });

    test("renders children when wallet is required and connected", () => {
      useUser.mockReturnValue({
        ...mockUserDefaults,
        isConnected: true,
        address: "0x1234567890123456789012345678901234567890",
      });

      render(
        <AccessControl requireWallet>
          <div>Wallet Protected Content</div>
        </AccessControl>
      );

      expect(screen.getByText("Wallet Protected Content")).toBeInTheDocument();
    });

    test("renders children when SSO is required and user is SSO authenticated", () => {
      useUser.mockReturnValue({
        ...mockUserDefaults,
        isSSO: true,
        user: { email: "test@university.edu" },
      });

      render(
        <AccessControl requireSSO>
          <div>SSO Protected Content</div>
        </AccessControl>
      );

      expect(screen.getByText("SSO Protected Content")).toBeInTheDocument();
    });
  });

  describe("Access Granted - Provider Requirements", () => {
    // Provider access logic: wallet users need isProvider=true, SSO users need isProvider=true OR faculty role
    test("renders children when wallet user is confirmed provider", () => {
      useUser.mockReturnValue({
        ...mockUserDefaults,
        isConnected: true,
        address: "0x1234567890123456789012345678901234567890",
        isProvider: true,
        isProviderLoading: false,
      });

      render(
        <AccessControl requireProvider>
          <div>Provider Dashboard</div>
        </AccessControl>
      );

      expect(screen.getByText("Provider Dashboard")).toBeInTheDocument();
    });

    // Faculty bypass: SSO users with faculty role get automatic provider access
    test("renders children when SSO user is faculty", () => {
      useUser.mockReturnValue({
        ...mockUserDefaults,
        isSSO: true,
        user: {
          email: "professor@university.edu",
          role: "Faculty",
        },
      });

      render(
        <AccessControl requireProvider>
          <div>Provider Dashboard</div>
        </AccessControl>
      );

      expect(screen.getByText("Provider Dashboard")).toBeInTheDocument();
    });

    test("renders children when SSO user is confirmed provider", () => {
      useUser.mockReturnValue({
        ...mockUserDefaults,
        isSSO: true,
        user: { email: "lab@university.edu" },
        isProvider: true,
        isProviderLoading: false,
      });

      render(
        <AccessControl requireProvider>
          <div>Provider Dashboard</div>
        </AccessControl>
      );

      expect(screen.getByText("Provider Dashboard")).toBeInTheDocument();
    });

    // Faculty role can be stored in either user.role or user.scopedRole
    test("detects faculty role from scopedRole property", () => {
      useUser.mockReturnValue({
        ...mockUserDefaults,
        isSSO: true,
        user: {
          email: "professor@university.edu",
          scopedRole: "Faculty Member",
        },
      });

      render(
        <AccessControl requireProvider>
          <div>Provider Dashboard</div>
        </AccessControl>
      );

      expect(screen.getByText("Provider Dashboard")).toBeInTheDocument();
    });

    test("detects faculty role case-insensitively", () => {
      useUser.mockReturnValue({
        ...mockUserDefaults,
        isSSO: true,
        user: {
          email: "professor@university.edu",
          role: "FACULTY",
        },
      });

      render(
        <AccessControl requireProvider>
          <div>Provider Dashboard</div>
        </AccessControl>
      );

      expect(screen.getByText("Provider Dashboard")).toBeInTheDocument();
    });
  });

  describe("Access Denied - Provider Requirements", () => {
    test("shows provider access denied message for wallet users", () => {
      useUser.mockReturnValue({
        ...mockUserDefaults,
        isConnected: true,
        address: "0x1234567890123456789012345678901234567890",
        isProvider: false,
        isProviderLoading: false,
      });

      render(
        <AccessControl requireProvider>
          <div>Provider Dashboard</div>
        </AccessControl>
      );

      expect(screen.getByText(/access restricted/i)).toBeInTheDocument();
      expect(
        screen.getByText(/only confirmed providers can access the lab panel/i)
      ).toBeInTheDocument();
    });

    test("shows provider access denied message for SSO users", () => {
      useUser.mockReturnValue({
        ...mockUserDefaults,
        isSSO: true,
        user: { email: "student@university.edu", role: "Student" },
        isProvider: false,
        isProviderLoading: false,
      });

      render(
        <AccessControl requireProvider>
          <div>Provider Dashboard</div>
        </AccessControl>
      );

      expect(screen.getByText(/access restricted/i)).toBeInTheDocument();
      expect(
        screen.getByText(/only faculty members and confirmed providers/i)
      ).toBeInTheDocument();
    });

    // Registration button only shown for wallet users (SSO providers registered differently)
    test('displays "Register as Provider" button for wallet users', async () => {
      const user = userEvent.setup();
      useUser.mockReturnValue({
        ...mockUserDefaults,
        isConnected: true,
        address: "0x1234567890123456789012345678901234567890",
        isProvider: false,
        isProviderLoading: false,
      });

      render(
        <AccessControl requireProvider>
          <div>Provider Dashboard</div>
        </AccessControl>
      );

      const registerButton = screen.getByRole("button", {
        name: /register as provider/i,
      });
      expect(registerButton).toBeInTheDocument();

      await user.click(registerButton);
      expect(mockPush).toHaveBeenCalledWith("/register");
    });

    test('does not display "Register as Provider" button for SSO users', () => {
      useUser.mockReturnValue({
        ...mockUserDefaults,
        isSSO: true,
        user: { email: "student@university.edu", role: "Student" },
        isProvider: false,
        isProviderLoading: false,
      });

      render(
        <AccessControl requireProvider>
          <div>Provider Dashboard</div>
        </AccessControl>
      );

      expect(
        screen.queryByRole("button", { name: /register as provider/i })
      ).not.toBeInTheDocument();
    });
  });

  describe("Redirect Behavior", () => {
    // Redirect only happens after loading completes to avoid premature redirects
    test("redirects to home page when access is denied", async () => {
      useUser.mockReturnValue({
        ...mockUserDefaults,
        isLoading: false,
        isWalletLoading: false,
      });

      render(
        <AccessControl>
          <div>Protected Content</div>
        </AccessControl>
      );

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/");
      });
    });

    test("does not redirect while loading", async () => {
      useUser.mockReturnValue({
        ...mockUserDefaults,
        isLoading: true,
      });

      render(
        <AccessControl>
          <div>Protected Content</div>
        </AccessControl>
      );

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(mockPush).not.toHaveBeenCalled();
    });

    test("does not redirect when user has access", async () => {
      useUser.mockReturnValue({
        ...mockUserDefaults,
        isLoggedIn: true,
        isLoading: false,
        isWalletLoading: false,
      });

      render(
        <AccessControl>
          <div>Protected Content</div>
        </AccessControl>
      );

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(mockPush).not.toHaveBeenCalled();
      expect(screen.getByText("Protected Content")).toBeInTheDocument();
    });
  });

  describe("Edge Cases", () => {
    test("handles missing role properties gracefully", () => {
      useUser.mockReturnValue({
        ...mockUserDefaults,
        isSSO: true,
        user: { email: "test@university.edu" },
        isProviderLoading: false,
      });

      render(
        <AccessControl requireProvider>
          <div>Provider Dashboard</div>
        </AccessControl>
      );

      expect(screen.getByText(/access restricted/i)).toBeInTheDocument();
    });

    // Component trims whitespace from role strings before checking
    test("handles role with whitespace trimming", () => {
      useUser.mockReturnValue({
        ...mockUserDefaults,
        isSSO: true,
        user: {
          email: "professor@university.edu",
          role: "  Faculty  ",
        },
      });

      render(
        <AccessControl requireProvider>
          <div>Provider Dashboard</div>
        </AccessControl>
      );

      expect(screen.getByText("Provider Dashboard")).toBeInTheDocument();
    });

    // Security: don't grant access while provider status is still being verified
    test("does not grant access while provider status is loading", () => {
      useUser.mockReturnValue({
        ...mockUserDefaults,
        isConnected: true,
        address: "0x1234567890123456789012345678901234567890",
        isProvider: true,
        isProviderLoading: true,
      });

      render(
        <AccessControl requireProvider>
          <div>Provider Dashboard</div>
        </AccessControl>
      );

      expect(screen.queryByText("Provider Dashboard")).not.toBeInTheDocument();
    });
  });
});
