/**
 * Unit Tests for Account Component
 *
 * Tests Behaviors:
 * - User information display for different authentication states (SSO vs Wallet)
 * - Data prioritization and fallback logic for user display names
 * - Logout functionality for both SSO and Wallet users
 * - Error handling during logout operations
 * - Tooltip and accessibility properties based on user state
 * - Edge cases and boundary conditions for user data
 *
 */

import { render, screen, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import Account from "../account";

// Mock wagmi hooks to isolate component testing from blockchain dependencies
const mockDisconnect = jest.fn();
const mockUseEnsName = jest.fn();
const mockUseEnsAvatar = jest.fn();

jest.mock("wagmi", () => ({
  useDisconnect: () => ({ disconnect: mockDisconnect }),
  useEnsName: (params) => mockUseEnsName(params),
  useEnsAvatar: (params) => mockUseEnsAvatar(params),
}));

// Mock FontAwesome components to simplify testing and avoid SVG rendering issues
jest.mock("@fortawesome/react-fontawesome", () => ({
  FontAwesomeIcon: ({ icon, className, title }) => (
    <span data-testid="logout-icon" className={className} title={title}>
      Logout Icon
    </span>
  ),
}));

jest.mock("@fortawesome/free-solid-svg-icons", () => ({
  faSignOutAlt: "mocked-icon",
}));

// Mock logger to prevent console noise during test execution
jest.mock("@/utils/dev/logger", () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    error: jest.fn(),
  },
}));

// Mutable mock user context that can be modified per test case
// This allows testing different authentication states without complex setup
let mockUserContext = {
  isConnected: false,
  isSSO: false,
  isLoggedIn: false,
  address: null,
  user: null,
  logoutSSO: jest.fn(),
};

jest.mock("@/context/UserContext", () => ({
  useUser: () => mockUserContext,
}));

describe("Account Component", () => {
  const originalLocation = window.location;
  const originalFetch = global.fetch;

  beforeEach(() => {
    // Reset all mocks to ensure test isolation
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Mock fetch for wallet logout endpoint (destroyWalletSession)
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    // Mock window.location to test navigation behavior without actual page reloads
    delete window.location;
    window.location = {
      href: "http://localhost/",
      assign: jest.fn(),
      replace: jest.fn(),
      reload: jest.fn(),
    };

    // Reset to default unauthenticated state before each test
    mockUserContext = {
      isConnected: false,
      isSSO: false,
      isLoggedIn: false,
      address: null,
      user: null,
      logoutSSO: jest.fn(),
    };

    // Reset ENS mocks to simulate no ENS data by default
    mockUseEnsName.mockReturnValue({ data: null });
    mockUseEnsAvatar.mockReturnValue({ data: null });
  });

  afterEach(() => {
    // Ensure all pending timers are executed and clean up fake timers
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    window.location = originalLocation;
    global.fetch = originalFetch;
  });

  describe("Rendering States", () => {
    test("renders logout button in all states", () => {
      render(<Account />);
      expect(screen.getByTestId("logout-icon")).toBeInTheDocument();
    });

    test("does not show user info when not logged in", () => {
      mockUserContext.isLoggedIn = false;
      render(<Account />);
      // Verify user info section is hidden for unauthenticated users
      expect(screen.queryByText(/Not connected/i)).not.toBeInTheDocument();
    });

    test("shows SSO user information with institution details", () => {
      mockUserContext = {
        isConnected: false,
        isSSO: true,
        isLoggedIn: true,
        address: null,
        user: {
          name: "John Doe",
          email: "john@university.edu",
          institutionName: "Test University",
          affiliation: "Computer Science",
        },
        logoutSSO: jest.fn(),
      };

      render(<Account />);
      expect(screen.getByText("Test University")).toBeInTheDocument();
      expect(screen.getByText("john@university.edu")).toBeInTheDocument();
    });

    test("shows wallet user information with formatted address", () => {
      mockUserContext = {
        isConnected: true,
        isSSO: false,
        isLoggedIn: true,
        address: "0x1234567890abcdef1234567890abcdef12345678",
        user: { name: "Wallet User" },
        logoutSSO: jest.fn(),
      };

      render(<Account />);
      expect(screen.getByText("Wallet User")).toBeInTheDocument();
      expect(screen.getByText("0x1234...5678")).toBeInTheDocument();
    });

    test("shows ENS name when available for wallet users", () => {
      mockUserContext = {
        isConnected: true,
        isSSO: false,
        isLoggedIn: true,
        address: "0x1234567890abcdef1234567890abcdef12345678",
        user: null,
        logoutSSO: jest.fn(),
      };

      mockUseEnsName.mockReturnValue({ data: "vitalik.eth" });
      render(<Account />);
      expect(screen.getByText("vitalik.eth")).toBeInTheDocument();
    });

    test("prioritizes user.name over ENS name for wallet users", () => {
      // This test ensures custom names take precedence over ENS names
      mockUserContext = {
        isConnected: true,
        isSSO: false,
        isLoggedIn: true,
        address: "0x1234567890abcdef1234567890abcdef12345678",
        user: { name: "Custom Name" },
        logoutSSO: jest.fn(),
      };

      mockUseEnsName.mockReturnValue({ data: "vitalik.eth" });
      render(<Account />);
      expect(screen.getByText("Custom Name")).toBeInTheDocument();
      expect(screen.queryByText("vitalik.eth")).not.toBeInTheDocument();
    });

    test("shows institutionName over affiliation for SSO users", () => {
      // Tests the priority: institutionName > affiliation > name
      mockUserContext = {
        isConnected: false,
        isSSO: true,
        isLoggedIn: true,
        address: null,
        user: {
          name: "John Doe",
          institutionName: "Harvard",
          affiliation: "MIT",
          email: "john@test.com",
        },
        logoutSSO: jest.fn(),
      };

      render(<Account />);
      expect(screen.getByText("Harvard")).toBeInTheDocument();
      expect(screen.queryByText("MIT")).not.toBeInTheDocument();
    });

    test("shows affiliation when institutionName is missing for SSO users", () => {
      mockUserContext = {
        isConnected: false,
        isSSO: true,
        isLoggedIn: true,
        address: null,
        user: {
          name: "Jane Smith",
          affiliation: "Stanford",
          email: "jane@test.com",
        },
        logoutSSO: jest.fn(),
      };

      render(<Account />);
      expect(screen.getByText("Stanford")).toBeInTheDocument();
    });

    test("shows name as fallback for SSO when institution data missing", () => {
      mockUserContext = {
        isConnected: false,
        isSSO: true,
        isLoggedIn: true,
        address: null,
        user: {
          name: "Bob Wilson",
          email: "bob@test.com",
        },
        logoutSSO: jest.fn(),
      };

      render(<Account />);
      expect(screen.getByText("Bob Wilson")).toBeInTheDocument();
    });

    test("shows id and SSO User as last fallback for SSO users", () => {
      // Tests the final fallback chain for SSO users
      mockUserContext = {
        isConnected: false,
        isSSO: true,
        isLoggedIn: true,
        address: null,
        user: { id: "123" },
        logoutSSO: jest.fn(),
      };

      render(<Account />);
      expect(screen.getByText("123")).toBeInTheDocument();
    });

    test("formats addresses correctly using truncation", () => {
      mockUserContext = {
        isConnected: true,
        isSSO: false,
        isLoggedIn: true,
        address: "0x1234567890abcdef1234567890abcdef12345678",
        user: null,
        logoutSSO: jest.fn(),
      };

      render(<Account />);
      expect(screen.getByText("0x1234...5678")).toBeInTheDocument();
    });

    test("shows Not connected for null address in wallet mode", () => {
      mockUserContext = {
        isConnected: true,
        isSSO: false,
        isLoggedIn: true,
        address: null,
        user: { name: "User" },
        logoutSSO: jest.fn(),
      };

      render(<Account />);
      expect(screen.getByText("Not connected")).toBeInTheDocument();
    });
  });

  describe("Logout Functionality", () => {
    describe("SSO Logout", () => {
      beforeEach(() => {
        // Setup SSO user context for logout tests
        mockUserContext = {
          isConnected: false,
          isSSO: true,
          isLoggedIn: true,
          address: null,
          user: { name: "SSO User", email: "sso@test.com" },
          logoutSSO: jest.fn().mockResolvedValue(undefined),
        };
      });

      test("calls logoutSSO for SSO users when logout button is clicked", async () => {
        render(<Account />);
        const logoutButton = screen.getByRole("button");

        await act(async () => {
          fireEvent.click(logoutButton);
        });

        expect(mockUserContext.logoutSSO).toHaveBeenCalled();
      });

      test("does not redirect after SSO logout - relies on context updates", async () => {
        const initialHref = window.location.href;

        render(<Account />);
        const logoutButton = screen.getByRole("button");

        await act(async () => {
          fireEvent.click(logoutButton);
        });

        expect(mockUserContext.logoutSSO).toHaveBeenCalled();

        // Advance timers to ensure no automatic redirect happens
        act(() => {
          jest.runAllTimers();
        });

        expect(window.location.href).toBe(initialHref);
      });

      test("does not call disconnect for SSO users - only uses logoutSSO", async () => {
        render(<Account />);
        const logoutButton = screen.getByRole("button");

        await act(async () => {
          fireEvent.click(logoutButton);
        });

        expect(mockUserContext.logoutSSO).toHaveBeenCalled();
        expect(mockDisconnect).not.toHaveBeenCalled();
      });
    });

    describe("Wallet Logout", () => {
      beforeEach(() => {
        // Setup wallet user context for logout tests
        mockUserContext = {
          isConnected: true,
          isSSO: false,
          isLoggedIn: true,
          address: "0x1234567890abcdef1234567890abcdef12345678",
          user: { name: "Wallet User" },
          logoutSSO: jest.fn(),
        };
      });

      test("calls disconnect for wallet users when logout button is clicked", async () => {
        render(<Account />);
        const logoutButton = screen.getByRole("button");

        await act(async () => {
          fireEvent.click(logoutButton);
        });

        expect(mockDisconnect).toHaveBeenCalled();
      });

      test("attempts to redirect after wallet disconnect", async () => {
        render(<Account />);
        const logoutButton = screen.getByRole("button");

        await act(async () => {
          fireEvent.click(logoutButton);
        });

        expect(mockDisconnect).toHaveBeenCalled();

        // Advance timers to trigger the redirect logic
        act(() => {
          jest.runAllTimers();
        });

        expect(mockDisconnect).toHaveBeenCalled();
      });

      test("does not call logoutSSO for wallet users - only uses disconnect", async () => {
        render(<Account />);
        const logoutButton = screen.getByRole("button");

        await act(async () => {
          fireEvent.click(logoutButton);
        });

        expect(mockDisconnect).toHaveBeenCalled();
        expect(mockUserContext.logoutSSO).not.toHaveBeenCalled();
      });
    });

    describe("Error Handling", () => {
      test("handles SSO logout error gracefully without crashing", async () => {
        mockUserContext = {
          isConnected: false,
          isSSO: true,
          isLoggedIn: true,
          address: null,
          user: { name: "SSO User" },
          logoutSSO: jest.fn().mockRejectedValue(new Error("Logout failed")),
        };

        render(<Account />);
        const logoutButton = screen.getByRole("button");

        await act(async () => {
          fireEvent.click(logoutButton);
        });

        expect(mockUserContext.logoutSSO).toHaveBeenCalled();

        // Component should not crash even when logout fails
        act(() => {
          jest.runAllTimers();
        });

        expect(mockUserContext.logoutSSO).toHaveBeenCalled();
      });

      test("handles wallet disconnect error gracefully without crashing", async () => {
        mockDisconnect.mockImplementation(() => {
          throw new Error("Disconnect failed");
        });

        mockUserContext = {
          isConnected: true,
          isSSO: false,
          isLoggedIn: true,
          address: "0x1234567890abcdef1234567890abcdef12345678",
          user: null,
          logoutSSO: jest.fn(),
        };

        render(<Account />);
        const logoutButton = screen.getByRole("button");

        await act(async () => {
          fireEvent.click(logoutButton);
        });

        act(() => {
          jest.runAllTimers();
        });

        expect(mockDisconnect).toHaveBeenCalled();
      });
    });
  });

  describe("Button Properties", () => {
    test('shows "Disconnect Wallet" tooltip for connected wallet users', () => {
      mockUserContext = {
        isConnected: true,
        isSSO: false,
        isLoggedIn: true,
        address: "0x1234567890abcdef1234567890abcdef12345678",
        user: null,
        logoutSSO: jest.fn(),
      };

      render(<Account />);
      const icon = screen.getByTestId("logout-icon");
      expect(icon).toHaveAttribute("title", "Disconnect Wallet");
    });

    test('shows "Logout" tooltip for non-connected users', () => {
      mockUserContext = {
        isConnected: false,
        isSSO: false,
        isLoggedIn: false,
        address: null,
        user: null,
        logoutSSO: jest.fn(),
      };

      render(<Account />);
      const icon = screen.getByTestId("logout-icon");
      expect(icon).toHaveAttribute("title", "Logout");
    });
  });

  describe("Edge Cases", () => {
    test("handles missing user object for wallet users by showing address", () => {
      mockUserContext = {
        isConnected: true,
        isSSO: false,
        isLoggedIn: true,
        address: "0x1234567890abcdef1234567890abcdef12345678",
        user: null,
        logoutSSO: jest.fn(),
      };

      render(<Account />);
      expect(screen.getByText("0x1234...5678")).toBeInTheDocument();
    });

    test("handles missing user object for SSO users with fallback text", () => {
      mockUserContext = {
        isConnected: false,
        isSSO: true,
        isLoggedIn: true,
        address: null,
        user: null,
        logoutSSO: jest.fn(),
      };

      render(<Account />);
      expect(screen.getByText("SSO User")).toBeInTheDocument();
    });

    test("renders correctly when both isConnected and isSSO are false", () => {
      // Tests the component in a completely unauthenticated state
      mockUserContext = {
        isConnected: false,
        isSSO: false,
        isLoggedIn: false,
        address: null,
        user: null,
        logoutSSO: jest.fn(),
      };

      render(<Account />);
      expect(screen.getByTestId("logout-icon")).toBeInTheDocument();
    });

    test("does not crash with empty user object", () => {
      mockUserContext = {
        isConnected: false,
        isSSO: true,
        isLoggedIn: true,
        address: null,
        user: {},
        logoutSSO: jest.fn(),
      };

      render(<Account />);
      expect(screen.getByText("SSO User")).toBeInTheDocument();
    });

    test("formats short addresses correctly without errors", () => {
      mockUserContext = {
        isConnected: true,
        isSSO: false,
        isLoggedIn: true,
        address: "0x123456789a",
        user: null,
        logoutSSO: jest.fn(),
      };

      render(<Account />);
      expect(screen.getByText("0x1234...789a")).toBeInTheDocument();
    });

    test("handles undefined address by showing Not connected", () => {
      mockUserContext = {
        isConnected: true,
        isSSO: false,
        isLoggedIn: true,
        address: undefined,
        user: null,
        logoutSSO: jest.fn(),
      };

      render(<Account />);
      expect(screen.getByText("Not connected")).toBeInTheDocument();
    });
  });
});
