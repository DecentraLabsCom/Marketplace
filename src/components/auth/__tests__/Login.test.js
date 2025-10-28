/**
 * Unit Tests for Login Component
 *
 * Tests the main authentication component that provides multiple login methods.
 * Validates modal behavior, keyboard interactions, authentication state handling,
 * and proper delegation to child authentication components.
 *
 * Test Behaviors:
 * - Button Rendering: Login button displays when user is not authenticated
 * - Account Display: Shows Account component when user is authenticated
 * - Modal State: Modal opens/closes correctly via button clicks
 * - Keyboard Navigation: ESC key closes modal, other keys are ignored
 * - Event Cleanup: Keyboard listeners are properly removed when modal closes
 * - Child Components: WalletLogin and InstitutionalLogin receive correct props
 * - Edge Cases: Handles rapid toggling, missing auth state, and ESC when closed
 * - Integration: Child components can close modal via passed props
 * - Event Bubbling: Modal doesn't close when clicking inside content
 * - Lifecycle: Event listeners are managed correctly during mount/unmount
 * - State Management: Properly handles authentication state from UserContext
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import Login from "../Login";
import { useUser } from "@/context/UserContext";

jest.mock("@/context/UserContext");
jest.mock("@/components/auth/WalletLogin", () => {
  return function MockWalletLogin({ setIsModalOpen }) {
    return (
      <div data-testid="wallet-login">
        <button onClick={() => setIsModalOpen(false)}>Mock Wallet Login</button>
      </div>
    );
  };
});
jest.mock("@/components/auth/InstitutionalLogin", () => {
  return function MockInstitutionalLogin({ setIsModalOpen }) {
    return (
      <div data-testid="institutional-login">
        <button onClick={() => setIsModalOpen(false)}>
          Mock Institutional Login
        </button>
      </div>
    );
  };
});
jest.mock("@/utils/auth/account", () => {
  return function MockAccount() {
    return <div data-testid="account">Account Component</div>;
  };
});
jest.mock("@/components/ui", () => ({
  Button: ({ children, onClick, className }) => (
    <button onClick={onClick} className={className} data-testid="login-button">
      {children}
    </button>
  ),
  Card: ({ children, onClick, className }) => (
    <div onClick={onClick} className={className} data-testid="card">
      {children}
    </div>
  ),
  CardHeader: ({ title }) => <div data-testid="card-header">{title}</div>,
  CardContent: ({ children }) => (
    <div data-testid="card-content">{children}</div>
  ),
}));
jest.mock("react-icons/fa", () => ({
  FaSignInAlt: () => <span data-testid="login-icon">LoginIcon</span>,
}));

describe("Login", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Authentication State", () => {
    test("renders login button when user is not logged in", () => {
      useUser.mockReturnValue({ isLoggedIn: false });

      render(<Login />);

      expect(screen.getByTestId("login-button")).toBeInTheDocument();
      expect(screen.getByText("Login")).toBeInTheDocument();
      expect(screen.getByTestId("login-icon")).toBeInTheDocument();
    });

    test("renders Account component when user is logged in", () => {
      useUser.mockReturnValue({ isLoggedIn: true });

      render(<Login />);

      expect(screen.getByTestId("account")).toBeInTheDocument();
      expect(screen.queryByTestId("login-button")).not.toBeInTheDocument();
    });

    test("does not render modal when user is logged in", () => {
      useUser.mockReturnValue({ isLoggedIn: true });

      render(<Login />);

      expect(screen.queryByText("Choose Login Method")).not.toBeInTheDocument();
    });
  });

  describe("Modal Behavior", () => {
    test("modal is closed by default", () => {
      useUser.mockReturnValue({ isLoggedIn: false });

      render(<Login />);

      expect(screen.queryByText("Choose Login Method")).not.toBeInTheDocument();
    });

    test("opens modal when login button is clicked", () => {
      useUser.mockReturnValue({ isLoggedIn: false });

      render(<Login />);
      fireEvent.click(screen.getByTestId("login-button"));

      expect(screen.getByText("Choose Login Method")).toBeInTheDocument();
    });

    test("closes modal when login button is clicked again", () => {
      useUser.mockReturnValue({ isLoggedIn: false });

      render(<Login />);
      const loginButton = screen.getByTestId("login-button");

      fireEvent.click(loginButton);
      expect(screen.getByText("Choose Login Method")).toBeInTheDocument();

      fireEvent.click(loginButton);
      expect(screen.queryByText("Choose Login Method")).not.toBeInTheDocument();
    });

    test("does not close modal when clicking inside modal content", () => {
      useUser.mockReturnValue({ isLoggedIn: false });

      render(<Login />);
      fireEvent.click(screen.getByTestId("login-button"));

      const modalCard = screen.getByTestId("card");
      fireEvent.click(modalCard);

      expect(screen.getByText("Choose Login Method")).toBeInTheDocument();
    });
  });

  describe("Keyboard Navigation", () => {
    test("closes modal when ESC key is pressed", () => {
      useUser.mockReturnValue({ isLoggedIn: false });

      render(<Login />);
      fireEvent.click(screen.getByTestId("login-button"));
      expect(screen.getByText("Choose Login Method")).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "Escape" });

      expect(screen.queryByText("Choose Login Method")).not.toBeInTheDocument();
    });

    test("does not close modal when other keys are pressed", () => {
      useUser.mockReturnValue({ isLoggedIn: false });

      render(<Login />);
      fireEvent.click(screen.getByTestId("login-button"));

      fireEvent.keyDown(window, { key: "Enter" });
      expect(screen.getByText("Choose Login Method")).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "Space" });
      expect(screen.getByText("Choose Login Method")).toBeInTheDocument();
    });

    test("does not add keyboard listener when modal is closed", () => {
      useUser.mockReturnValue({ isLoggedIn: false });
      const addEventListenerSpy = jest.spyOn(window, "addEventListener");

      render(<Login />);

      expect(addEventListenerSpy).not.toHaveBeenCalledWith(
        "keydown",
        expect.any(Function)
      );
    });

    test("adds keyboard listener when modal opens", () => {
      useUser.mockReturnValue({ isLoggedIn: false });
      const addEventListenerSpy = jest.spyOn(window, "addEventListener");

      render(<Login />);
      fireEvent.click(screen.getByTestId("login-button"));

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "keydown",
        expect.any(Function)
      );
    });

    test("removes keyboard listener when modal closes", () => {
      useUser.mockReturnValue({ isLoggedIn: false });
      const removeEventListenerSpy = jest.spyOn(window, "removeEventListener");

      const { unmount } = render(<Login />);
      fireEvent.click(screen.getByTestId("login-button"));

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "keydown",
        expect.any(Function)
      );
    });
  });

  describe("Child Components", () => {
    test("renders WalletLogin component when modal is open", () => {
      useUser.mockReturnValue({ isLoggedIn: false });

      render(<Login />);
      fireEvent.click(screen.getByTestId("login-button"));

      expect(screen.getByTestId("wallet-login")).toBeInTheDocument();
    });

    test("renders InstitutionalLogin component when modal is open", () => {
      useUser.mockReturnValue({ isLoggedIn: false });

      render(<Login />);
      fireEvent.click(screen.getByTestId("login-button"));

      expect(screen.getByTestId("institutional-login")).toBeInTheDocument();
    });

    test("passes setIsModalOpen prop to WalletLogin", () => {
      useUser.mockReturnValue({ isLoggedIn: false });

      render(<Login />);
      fireEvent.click(screen.getByTestId("login-button"));

      const walletLoginButton = screen.getByText("Mock Wallet Login");
      fireEvent.click(walletLoginButton);

      expect(screen.queryByText("Choose Login Method")).not.toBeInTheDocument();
    });

    test("passes setIsModalOpen prop to InstitutionalLogin", () => {
      useUser.mockReturnValue({ isLoggedIn: false });

      render(<Login />);
      fireEvent.click(screen.getByTestId("login-button"));

      const institutionalLoginButton = screen.getByText(
        "Mock Institutional Login"
      );
      fireEvent.click(institutionalLoginButton);

      expect(screen.queryByText("Choose Login Method")).not.toBeInTheDocument();
    });
  });

  describe("Edge Cases", () => {
    test("handles rapid modal toggle correctly", () => {
      useUser.mockReturnValue({ isLoggedIn: false });

      render(<Login />);
      const loginButton = screen.getByTestId("login-button");

      fireEvent.click(loginButton);
      fireEvent.click(loginButton);
      fireEvent.click(loginButton);

      expect(screen.getByText("Choose Login Method")).toBeInTheDocument();
    });

    test("handles ESC key press when modal is already closed", () => {
      useUser.mockReturnValue({ isLoggedIn: false });

      render(<Login />);

      fireEvent.keyDown(window, { key: "Escape" });

      expect(screen.queryByText("Choose Login Method")).not.toBeInTheDocument();
    });

    test("modal does not render without isLoggedIn state", () => {
      useUser.mockReturnValue({});

      render(<Login />);

      expect(screen.getByTestId("login-button")).toBeInTheDocument();
      expect(screen.queryByTestId("account")).not.toBeInTheDocument();
    });
  });
});
