/**
 * Integration Tests: Wallet Connection Flow
 *
 * Test Behaviors:
 * - User can open login modal and see connection options
 * - Wallet connection integrates with UserContext
 * - Connector selection works (MetaMask, WalletConnect)
 * - SSO fallback redirects correctly
 * - Connection success updates user state
 * - Disconnect cleans up state properly
 * - Error handling works gracefully
 *
 * @test-suite WalletConnectionFlow
 */

import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithAllProviders } from "@/test-utils/test-providers";
import Login from "@/components/auth/Login";
import { mockUser } from "@/test-utils/mocks/mockData";

//  Mock wagmi hooks for wallet connection testing

// Mock connectors
const mockMetaMaskConnector = {
  uid: "metamask-connector",
  name: "MetaMask",
  type: "injected",
  ready: true,
  getProvider: jest.fn().mockResolvedValue({}),
};

const mockWalletConnectConnector = {
  uid: "walletconnect-connector",
  name: "WalletConnect",
  type: "walletConnect",
  ready: true,
  getProvider: jest.fn().mockResolvedValue({}),
};

// Mock wagmi hooks
const mockConnect = jest.fn();
const mockDisconnect = jest.fn();

jest.mock("wagmi", () => ({
  http: jest.fn(() => ({ type: "http" })),
  createConfig: jest.fn((config) => config),
  WagmiProvider: ({ children }) => children,
  useConnect: jest.fn(() => ({
    connectors: [mockMetaMaskConnector, mockWalletConnectConnector],
    connect: mockConnect,
    error: null,
    isLoading: false,
    pendingConnector: null,
  })),
  useDisconnect: jest.fn(() => ({
    disconnect: mockDisconnect,
  })),
  useAccount: jest.fn(() => ({
    address: null,
    isConnected: false,
    isReconnecting: false,
    isConnecting: false,
  })),
  useEnsName: jest.fn(() => ({
    data: null,
    isLoading: false,
  })),
  useEnsAvatar: jest.fn(() => ({
    data: null,
    isLoading: false,
  })),
}));

/**
 * Mock wagmi chains
 */
jest.mock("wagmi/chains", () => ({
  mainnet: {
    id: 1,
    name: "Ethereum",
    network: "homestead",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: {
      default: { http: ["https://eth.llamarpc.com"] },
      public: { http: ["https://eth.llamarpc.com"] },
    },
  },
}));

/**
 * Mock Next.js router for SSO redirect testing
 */
const mockRouterPush = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * Mock User Context hooks with stable return values to prevent infinite re-renders
 */
const mockRefetch = jest.fn();
const mockRefreshProviderStatus = jest.fn();
const mockClearSSOSession = jest.fn();

const mockSSOSessionData = {
  data: null,
  isLoading: false,
  error: null,
  refetch: mockRefetch,
};

const mockLabProviderData = {
  data: { isLabProvider: false },
  isLoading: false,
  error: null,
};

const mockLabProvidersData = {
  data: null,
  isLoading: false,
};

const mockUserCacheUpdates = {
  refreshProviderStatus: mockRefreshProviderStatus,
  clearSSOSession: mockClearSSOSession,
};

jest.mock("@/hooks/user/useUsers", () => ({
  useSSOSessionQuery: jest.fn(() => mockSSOSessionData),
  useIsLabProviderQuery: jest.fn(() => mockLabProviderData),
  useGetLabProvidersQuery: jest.fn(() => mockLabProvidersData),
  useUserCacheUpdates: jest.fn(() => mockUserCacheUpdates),
}));

/**
 * Mock Notification Context
 */
jest.mock("@/context/NotificationContext", () => ({
  NotificationProvider: ({ children }) => children,
  useNotifications: () => ({
    addTemporaryNotification: jest.fn(),
    addErrorNotification: jest.fn(),
    addSuccessNotification: jest.fn(),
  }),
}));

/**
 * Mock LabToken Context
 */
jest.mock("@/context/LabTokenContext", () => ({
  LabTokenProvider: ({ children }) => children,
  useLabToken: () => ({
    formatPrice: (price) => price,
    formatTokenAmount: (amount) => amount,
    decimals: 18,
    balance: BigInt("0"),
    allowance: BigInt("0"),
    isLoading: false,
  }),
}));

/**
 * Mock OptimisticUI Context
 */
jest.mock("@/context/OptimisticUIContext", () => ({
  OptimisticUIProvider: ({ children }) => children,
  useOptimisticUI: () => ({
    optimisticData: {},
    addOptimisticData: jest.fn(),
    removeOptimisticData: jest.fn(),
  }),
}));

describe("Wallet Connection Flow Integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset wagmi mocks to default disconnected state
    const { useAccount, useConnect } = require("wagmi");

    useAccount.mockReturnValue({
      address: null,
      isConnected: false,
      isReconnecting: false,
      isConnecting: false,
    });

    useConnect.mockReturnValue({
      connectors: [mockMetaMaskConnector, mockWalletConnectConnector],
      connect: mockConnect,
      error: null,
      isLoading: false,
      pendingConnector: null,
    });
  });

  /**
   * Test Case: Login modal opens and shows connection options
   * Verifies the UI flow for opening the login modal
   */
  test("opens login modal and displays wallet connection options", async () => {
    renderWithAllProviders(<Login />);

    // Verify login button is present
    const loginButton = screen.getByRole("button", { name: /login/i });
    expect(loginButton).toBeInTheDocument();

    // Click login button to open modal
    fireEvent.click(loginButton);

    // Wait for modal to appear
    await waitFor(() => {
      expect(screen.getByText(/choose login method/i)).toBeInTheDocument();
    });

    // Verify both wallet and institutional options are shown
    expect(screen.getByText(/wallet login/i)).toBeInTheDocument();
    expect(screen.getByText(/institutional login/i)).toBeInTheDocument();
  });

  /**
   * Test Case: Wallet Login button opens connector selection modal
   * Verifies that clicking Wallet Login shows available connectors
   */
  test("displays available wallet connectors when wallet login is clicked", async () => {
    renderWithAllProviders(<Login />);

    // Open main login modal
    const loginButton = screen.getByRole("button", { name: /login/i });
    fireEvent.click(loginButton);

    // Wait for modal to appear
    await waitFor(() => {
      expect(screen.getByText(/choose login method/i)).toBeInTheDocument();
    });

    // Click "Wallet Login" button
    const walletLoginButton = screen
      .getByText(/wallet login/i)
      .closest("button");
    fireEvent.click(walletLoginButton);

    // Wait for wallet connector modal to appear
    await waitFor(() => {
      expect(screen.getByText(/choose wallet/i)).toBeInTheDocument();
    });

    // Verify MetaMask connector is shown
    expect(screen.getByText("MetaMask")).toBeInTheDocument();

    // Verify WalletConnect connector is shown
    expect(screen.getByText("WalletConnect")).toBeInTheDocument();
  });

  /**
   * Test Case: Selecting a connector triggers connection
   * Verifies that clicking a connector calls useConnect with correct params
   */
  test("triggers wallet connection when connector is selected", async () => {
    renderWithAllProviders(<Login />);

    // Open login modal
    const loginButton = screen.getByRole("button", { name: /login/i });
    fireEvent.click(loginButton);

    // Wait for modal
    await waitFor(() => {
      expect(screen.getByText(/choose login method/i)).toBeInTheDocument();
    });

    // Click "Wallet Login"
    const walletLoginButton = screen
      .getByText(/wallet login/i)
      .closest("button");
    fireEvent.click(walletLoginButton);

    // Wait for connector modal
    await waitFor(() => {
      expect(screen.getByText(/choose wallet/i)).toBeInTheDocument();
    });

    // Click MetaMask connector
    const metaMaskButton = screen.getByText("MetaMask").closest("button");
    fireEvent.click(metaMaskButton);

    // Verify connect was called with MetaMask connector
    await waitFor(() => {
      expect(mockConnect).toHaveBeenCalledWith({
        connector: mockMetaMaskConnector,
      });
    });
  });

  /**
   * Test Case: Connection success updates UserContext
   * Simulates successful connection and verifies state sync
   */
  test("syncs wallet address with UserContext after connection", async () => {
    // Mock successful connection
    const { useAccount } = require("wagmi");
    useAccount.mockReturnValue({
      address: mockUser.address,
      isConnected: true,
      isReconnecting: false,
      isConnecting: false,
    });

    const { rerender } = renderWithAllProviders(<Login />);

    // Force re-render to pick up new useAccount value
    rerender(<Login />);

    // After connection, Login button should not be visible (replaced by Account)
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /login/i })
      ).not.toBeInTheDocument();
    });
  });

  /**
   * Test Case: Modal can be closed
   * Verifies that the modal closes when pressing Escape key
   */
  test("closes login modal when pressing Escape key", async () => {
    renderWithAllProviders(<Login />);

    // Open modal
    const loginButton = screen.getByRole("button", { name: /login/i });
    fireEvent.click(loginButton);

    // Wait for modal
    await waitFor(() => {
      expect(screen.getByText(/choose login method/i)).toBeInTheDocument();
    });

    // Press Escape key to close modal
    fireEvent.keyDown(window, { key: "Escape" });

    // Verify modal is closed
    await waitFor(() => {
      expect(
        screen.queryByText(/choose login method/i)
      ).not.toBeInTheDocument();
    });
  });

  /**
   * Test Case: SSO fallback redirects correctly
   * Verifies that clicking Institutional Login triggers SSO redirect
   */
  test("redirects to SSO when institutional login is clicked", async () => {
    renderWithAllProviders(<Login />);

    // Open login modal
    const loginButton = screen.getByRole("button", { name: /login/i });
    fireEvent.click(loginButton);

    // Wait for modal
    await waitFor(() => {
      expect(screen.getByText(/choose login method/i)).toBeInTheDocument();
    });

    // Click "Institutional Login"
    const institutionalButton = screen
      .getByText(/institutional login/i)
      .closest("button");
    fireEvent.click(institutionalButton);

    // Verify router.push was called with SSO endpoint
    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith("/api/auth/sso/saml2/login");
    });

    // Verify modal is closed
    await waitFor(() => {
      expect(
        screen.queryByText(/choose login method/i)
      ).not.toBeInTheDocument();
    });
  });

  /**
   * Test Case: Disconnected state shows Login button
   * Verifies that when wallet is disconnected, Login button is visible
   */
  test("displays login button when wallet is disconnected", async () => {
    // Ensure wallet is disconnected (default state from beforeEach)
    renderWithAllProviders(<Login />);

    // Verify Login button is visible in disconnected state
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /login/i })
      ).toBeInTheDocument();
    });

    // Verify modal is not open
    expect(screen.queryByText(/choose login method/i)).not.toBeInTheDocument();
  });

  /**
   * Test Case: Connector selection modal can be closed
   * Verifies that the wallet connector modal can be dismissed
   */
  test("closes wallet connector modal when close button is clicked", async () => {
    renderWithAllProviders(<Login />);

    // Open login modal
    const loginButton = screen.getByRole("button", { name: /login/i });
    fireEvent.click(loginButton);

    await waitFor(() => {
      expect(screen.getByText(/choose login method/i)).toBeInTheDocument();
    });

    // Open wallet connector modal
    const walletLoginButton = screen
      .getByText(/wallet login/i)
      .closest("button");
    fireEvent.click(walletLoginButton);

    await waitFor(() => {
      expect(screen.getByText(/choose wallet/i)).toBeInTheDocument();
    });

    // Find and click close button (X icon)
    const closeButtons = screen.getAllByRole("button");
    const closeButton = closeButtons.find((button) => {
      const svg = button.querySelector("svg");
      return svg && svg.querySelector('path[d*="M6 18L18 6M6 6l12 12"]');
    });

    expect(closeButton).toBeTruthy();
    fireEvent.click(closeButton);

    // Verify wallet connector modal is closed
    await waitFor(() => {
      expect(screen.queryByText(/choose wallet/i)).not.toBeInTheDocument();
    });
  });

  /**
   * Test Case: Handle connection error gracefully
   * Verifies that connection errors are handled without crashing
   */
  test("handles connection errors gracefully", async () => {
    // Mock connection error
    mockConnect.mockImplementationOnce(() => {
      throw new Error("User rejected connection");
    });

    renderWithAllProviders(<Login />);

    // Open login modal
    const loginButton = screen.getByRole("button", { name: /login/i });
    fireEvent.click(loginButton);

    await waitFor(() => {
      expect(screen.getByText(/choose login method/i)).toBeInTheDocument();
    });

    // Open wallet connector modal
    const walletLoginButton = screen
      .getByText(/wallet login/i)
      .closest("button");
    fireEvent.click(walletLoginButton);

    await waitFor(() => {
      expect(screen.getByText(/choose wallet/i)).toBeInTheDocument();
    });

    // Try to connect (will throw error)
    const metaMaskButton = screen.getByText("MetaMask").closest("button");
    fireEvent.click(metaMaskButton);

    // Verify the app doesn't crash - wallet modal should still be visible
    await waitFor(() => {
      expect(screen.getByText(/choose wallet/i)).toBeInTheDocument();
    });
  });

  /**
   * Test Case: Displays connectors with correct ready state
   * Verifies that unavailable connectors are shown as disabled
   */
  test("displays disabled state for unavailable connectors", async () => {
    // Mock one connector as not ready
    const notReadyConnector = {
      ...mockMetaMaskConnector,
      ready: false,
      getProvider: jest.fn().mockResolvedValue(null),
    };

    const { useConnect } = require("wagmi");
    useConnect.mockReturnValue({
      connectors: [notReadyConnector, mockWalletConnectConnector],
      connect: mockConnect,
      error: null,
      isLoading: false,
      pendingConnector: null,
    });

    renderWithAllProviders(<Login />);

    // Open modals
    const loginButton = screen.getByRole("button", { name: /login/i });
    fireEvent.click(loginButton);

    await waitFor(() => {
      expect(screen.getByText(/choose login method/i)).toBeInTheDocument();
    });

    const walletLoginButton = screen
      .getByText(/wallet login/i)
      .closest("button");
    fireEvent.click(walletLoginButton);

    await waitFor(() => {
      expect(screen.getByText(/choose wallet/i)).toBeInTheDocument();
    });

    // Verify MetaMask shows "Not available"
    await waitFor(() => {
      expect(screen.getByText(/not available/i)).toBeInTheDocument();
    });

    // Verify MetaMask button is disabled
    const metaMaskButton = screen.getByText("MetaMask").closest("button");
    expect(metaMaskButton).toBeDisabled();
  });
});
