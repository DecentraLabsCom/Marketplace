/**
 * Unit Tests for UserData Context
 *
 * Tests user authentication context including SSO, wallet connection,
 * provider status management, and logout functionality. Validates state
 * management, data fetching integration, and error handling.
 *
 * Tests Behaviors:
 * - Context initialization and provider/hook integration
 * - SSO authentication flow and session management
 * - Wallet connection and disconnection handling
 * - Provider status detection and data fetching
 * - Logout flow with cache cleanup
 * - Error handling and recovery
 * - Edge cases (missing data, race conditions, loading states)
 */

import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserData, useUser } from "../UserContext";
import * as wagmiHooks from "wagmi";
import * as userHooks from "@/hooks/user/useUsers";
import * as errorBoundaries from "@/utils/errorBoundaries";

// Mock external dependencies
jest.mock("wagmi", () => ({
  useConnection: jest.fn(),
}));

jest.mock("@/hooks/user/useUsers", () => ({
  useSSOSessionQuery: jest.fn(),
  useIsLabProvider: jest.fn(),
  useGetLabProviders: jest.fn(),
  useUserCacheUpdates: jest.fn(),
  useInstitutionResolve: jest.fn(),
  useOnboardingSession: jest.fn(),
}));

jest.mock("@/utils/errorBoundaries", () => ({
  ErrorBoundary: ({ children }) => children,
  useErrorHandler: jest.fn(),
  ErrorSeverity: {},
  ErrorCategory: {},
}));

jest.mock("@/utils/optimizedContext", () => ({
  createOptimizedContext: (name) => {
    const React = require("react");
    const Context = React.createContext(null);
    return {
      Provider: Context.Provider,
      useContext: () => React.useContext(Context),
    };
  },
}));

jest.mock("@/utils/dev/logger", () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

// Mock global fetch
global.fetch = jest.fn();

// Helper to create fresh QueryClient
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

// Helper to create wrapper with providers
const createWrapper = (queryClient) => {
  return ({ children }) => (
    <QueryClientProvider client={queryClient}>
      <UserData>{children}</UserData>
    </QueryClientProvider>
  );
};

describe("UserData Context", () => {
  // Default mock implementations
  const mockUseConnection = {
    accounts: [null],
    chain: undefined,
    status: 'disconnected',
  };

  const mockUseErrorHandler = {
    handleError: jest.fn(),
  };

  const mockUseCacheUpdates = {
    refreshProviderStatus: jest.fn(),
    clearSSOSession: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch.mockReset();
    window.localStorage.clear();

    // Setup default mocks
    wagmiHooks.useConnection.mockReturnValue(mockUseConnection);
    errorBoundaries.useErrorHandler.mockReturnValue(mockUseErrorHandler);
    userHooks.useUserCacheUpdates.mockReturnValue(mockUseCacheUpdates);

    // Default React Query hooks return values
    userHooks.useSSOSessionQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    userHooks.useIsLabProvider.mockReturnValue({
      data: { isLabProvider: false },
      isLoading: false,
      error: null,
    });

    userHooks.useGetLabProviders.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });

    // Default mocks for new hooks
    userHooks.useInstitutionResolve.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });

    userHooks.useOnboardingSession.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });

    userHooks.useIsLabProvider.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });

    userHooks.useGetLabProviders.mockReturnValue({
      data: null,
      isLoading: false,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("Context Initialization", () => {
    test("provides context value to children", () => {
      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useUser(), {
        wrapper: createWrapper(queryClient),
      });

      expect(result.current).toBeDefined();
      expect(result.current.user).toBeNull();
      expect(result.current.isSSO).toBeUndefined();
      expect(result.current.isProvider).toBe(false);
      expect(result.current.isLoggedIn).toBe(false);
    });

    test("throws error when useUser is called outside provider", () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      expect(() => {
        renderHook(() => useUser());
      }).toThrow("useUser must be used within a UserData provider");

      consoleSpy.mockRestore();
    });

    test("initializes with loading state when wallet is reconnecting", () => {
      wagmiHooks.useConnection.mockReturnValue({
        ...mockUseConnection,
        status: 'reconnecting',
      });

      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useUser(), {
        wrapper: createWrapper(queryClient),
      });

      expect(result.current.isWalletLoading).toBe(true);
      expect(result.current.isLoading).toBe(true);
    });
  });

  describe("SSO Authentication", () => {
    test("sets SSO user data when session is active", async () => {
      const mockSSOUser = {
        name: "Test User",
        email: "test@uned.es",
        affiliation: "uned.es",
        organizationName: "UNED",
      };

      userHooks.useSSOSessionQuery.mockReturnValue({
        data: { user: mockSSOUser, isSSO: true },
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      });

      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useUser(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isSSO).toBe(true);
        expect(result.current.user).toMatchObject({
          name: "Test User",
          email: "test@uned.es",
          institutionName: "UNED",
        });
        expect(result.current.isLoggedIn).toBe(true);
      });
    });

    test("extracts institution name from affiliation when organizationName missing", async () => {
      const mockSSOUser = {
        name: "Test User",
        email: "test@example.edu",
        affiliation: "example.edu",
      };

      userHooks.useSSOSessionQuery.mockReturnValue({
        data: { user: mockSSOUser, isSSO: true },
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      });

      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useUser(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.user?.institutionName).toBe("EXAMPLE");
      });
    });

    test("handles SSO logout correctly", async () => {
      const mockRefetch = jest.fn();
      userHooks.useSSOSessionQuery.mockReturnValue({
        data: { user: { name: "Test User" }, isSSO: true },
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: null, isSSO: false }),
      });

      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useUser(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isSSO).toBe(true);
      });

      await act(async () => {
        await result.current.logoutSSO();
      });

      await waitFor(
        () => {
          expect(result.current.isSSO).toBe(false);
          expect(result.current.user).toBeNull();
          expect(mockUseCacheUpdates.clearSSOSession).toHaveBeenCalled();
        },
        { timeout: 5000 }
      );
    });
  });

  describe("Institution Registration", () => {
    test("marks institution as registered when resolve returns wallet", async () => {
      const mockSSOUser = {
        name: "Test User",
        email: "test@uned.es",
        affiliation: "uned.es",
      };

      userHooks.useSSOSessionQuery.mockReturnValue({
        data: { user: mockSSOUser, isSSO: true },
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      });

      userHooks.useInstitutionResolve.mockReturnValue({
        data: {
          registered: true,
          wallet: "0xabc",
          domain: "uned.es",
          backendUrl: "https://sarlab.dia.uned.es",
        },
        isLoading: false,
        error: null,
      });

      userHooks.useOnboardingSession.mockReturnValue({
        data: {
          status: 'ok',
          payload: { stableUserId: 'test@uned.es' },
          meta: { stableUserId: 'test@uned.es', institutionId: 'uned.es' }
        },
        isLoading: false,
        error: null,
      });

      global.fetch.mockImplementation((url) => {
        if (String(url).includes("/onboarding/webauthn/key-status/")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ hasCredential: true }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({}),
        });
      });

      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useUser(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isSSO).toBe(true);
        expect(result.current.isInstitutionRegistered).toBe(true);
        expect(result.current.institutionRegistrationStatus).toBe("registered");
        expect(result.current.institutionRegistrationWallet).toBe("0xabc");
      });
    });

    test("shows advisory modal when IB has credential but local browser not registered", async () => {
        const mockSSOUser = {
          name: "Test User",
          email: "test@uned.es",
          affiliation: "uned.es",
        };

        userHooks.useSSOSessionQuery.mockReturnValue({
          data: { user: mockSSOUser, isSSO: true },
          isLoading: false,
          error: null,
          refetch: jest.fn(),
        });

        userHooks.useInstitutionResolve.mockReturnValue({
          data: {
            registered: true,
            wallet: "0xabc",
            domain: "uned.es",
            backendUrl: "https://sarlab.dia.uned.es",
          },
          isLoading: false,
          error: null,
        });

        userHooks.useOnboardingSession.mockReturnValue({
          data: {
            status: 'ok',
            payload: { stableUserId: 'test@uned.es' },
            meta: { stableUserId: 'test@uned.es', institutionId: 'uned.es' }
          },
          isLoading: false,
          error: null,
        });

        global.fetch.mockImplementation((url) => {
          const u = String(url);

          // Provide session payload required by UserContext check
          if (u.includes('/api/onboarding/session')) {
            return Promise.resolve({
              ok: true,
              json: async () => ({
                status: 'ok',
                payload: { stableUserId: 'test@uned.es' },
                meta: { stableUserId: 'test@uned.es', institutionId: 'uned.es' },
              }),
            });
          }

          if (u.includes("/onboarding/webauthn/key-status/")) {
            return Promise.resolve({
              ok: true,
              json: async () => ({ hasCredential: true }),
            });
          }

          if (u.includes("/api/auth/webauthn/status")) {
            return Promise.resolve({
              ok: true,
              json: async () => ({ registered: false }),
            });
          }

          return Promise.resolve({
            ok: true,
            json: async () => ({}),
          });
        });

        const queryClient = createTestQueryClient();
        const { result } = renderHook(() => useUser(), {
          wrapper: createWrapper(queryClient),
        });

        await waitFor(() => {
          expect(result.current.institutionalOnboardingStatus).toBe("advisory");
          expect(result.current.showOnboardingModal).toBe(true);
        });
      });

    test("shows advisory modal in a new browser even if local endpoint says registered", async () => {
      const mockSSOUser = {
        name: "Test User",
        email: "test@uned.es",
        affiliation: "uned.es",
      };

      userHooks.useSSOSessionQuery.mockReturnValue({
        data: { user: mockSSOUser, isSSO: true },
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      });

      userHooks.useInstitutionResolve.mockReturnValue({
        data: {
          registered: true,
          wallet: "0xabc",
          domain: "uned.es",
          backendUrl: "https://sarlab.dia.uned.es",
        },
        isLoading: false,
        error: null,
      });

      global.fetch.mockImplementation((url) => {
        const u = String(url);
        if (u.includes('/api/onboarding/session')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              status: 'ok',
              payload: { stableUserId: 'test@uned.es' },
              meta: { stableUserId: 'test@uned.es', institutionId: 'uned.es' },
            }),
          });
        }

        if (u.includes("/onboarding/webauthn/key-status/")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ hasCredential: true }),
          });
        }

        if (u.includes("/api/auth/webauthn/status")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ registered: true }),
          });
        }

        return Promise.resolve({
          ok: true,
          json: async () => ({}),
        });
      });

      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useUser(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.institutionalOnboardingStatus).toBe("advisory");
        expect(result.current.showOnboardingModal).toBe(true);
      });
    });

    test("shows advisory modal when key-status endpoint errors and includes institutionId in request", async () => {
      const mockSSOUser = {
        name: "Test User",
        email: "test@uned.es",
        affiliation: "uned.es",
      };

      userHooks.useSSOSessionQuery.mockReturnValue({
        data: { user: mockSSOUser, isSSO: true },
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      });

      userHooks.useInstitutionResolve.mockReturnValue({
        data: {
          registered: true,
          wallet: "0xabc",
          domain: "uned.es",
          backendUrl: "https://sarlab.dia.uned.es",
        },
        isLoading: false,
        error: null,
      });

      let keyStatusRequestUrl = null;
      global.fetch.mockImplementation((url) => {
        const u = String(url);
        if (u.includes('/api/onboarding/session')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              status: 'ok',
              payload: { stableUserId: 'test@uned.es' },
              meta: { stableUserId: 'test@uned.es', institutionId: 'uned.es' },
            }),
          });
        }

        if (u.includes("/onboarding/webauthn/key-status/")) {
          keyStatusRequestUrl = u;
          return Promise.resolve({
            ok: false,
            status: 500,
            json: async () => ({}),
          });
        }

        return Promise.resolve({
          ok: true,
          json: async () => ({}),
        });
      });

      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useUser(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.institutionalOnboardingStatus).toBe("advisory");
        expect(result.current.showOnboardingModal).toBe(true);
      });

      expect(keyStatusRequestUrl).toContain("institutionId=uned.es");
    });

    test("marks institution as unregistered when resolve returns no wallet", async () => {
      const mockSSOUser = {
        name: "Test User",
        email: "test@example.edu",
        affiliation: "example.edu",
      };

      userHooks.useSSOSessionQuery.mockReturnValue({
        data: { user: mockSSOUser, isSSO: true },
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      });

      userHooks.useInstitutionResolve.mockReturnValue({
        data: {
          registered: false,
          wallet: null,
          domain: "example.edu",
        },
        isLoading: false,
        error: null,
      });

      userHooks.useOnboardingSession.mockReturnValue({
        data: {
          status: 'ok',
          payload: { stableUserId: 'test@example.edu' },
          meta: { stableUserId: 'test@example.edu', institutionId: 'example.edu' }
        },
        isLoading: false,
        error: null,
      });

      global.fetch.mockImplementation((url) => {
        if (String(url).includes("/onboarding/webauthn/key-status/")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ hasCredential: true }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({}),
        });
      });

      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useUser(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isSSO).toBe(true);
        expect(result.current.isInstitutionRegistered).toBe(false);
        expect(result.current.institutionRegistrationStatus).toBe("unregistered");
        expect(result.current.institutionRegistrationWallet).toBeNull();
      });
    });
  });

  describe("Wallet Connection", () => {
    test("sets user data when wallet is connected", async () => {
      const testAddress = "0x1234567890abcdef";

      wagmiHooks.useConnection.mockReturnValue({
        accounts: [testAddress],
        chain: { id: 11155111, name: 'sepolia' },
        status: 'connected',
      });

      userHooks.useIsLabProvider.mockReturnValue({
        data: { isLabProvider: false },
        isLoading: false,
        error: null,
      });

      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useUser(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
        expect(result.current.address).toBe(testAddress);
        expect(result.current.isLoggedIn).toBe(true);
        expect(result.current.user?.address).toBe(testAddress);
      });
    });

    test("clears user data and logs out when wallet is disconnected AND no SSO session exists", async () => {
      const testAddress = "0x1234567890abcdef";

      // SSO session is false
      userHooks.useSSOSessionQuery.mockReturnValue({
        data: { user: null, isSSO: false },
        isLoading: false,
      });

      wagmiHooks.useConnection.mockReturnValue({
        accounts: [testAddress],
        chain: { id: 11155111, name: "sepolia" },
        status: "connected",
      });

      userHooks.useIsLabProvider.mockReturnValue({
        data: { isLabProvider: false },
        isLoading: false,
      });

      const queryClient = createTestQueryClient();
      const { result, rerender } = renderHook(() => useUser(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => expect(result.current.isConnected).toBe(true));

      // Disconnect wallet
      wagmiHooks.useConnection.mockReturnValue({
        address: null,
        isConnected: false,
        isReconnecting: false,
        isConnecting: false,
      });

      rerender();

      await waitFor(() => {
        expect(result.current.isConnected).toBe(false);
        expect(result.current.isLoggedIn).toBe(false);
        expect(result.current.user).toBeNull();
      });
    });

    test("clears wallet session user when wallet is disconnected", async () => {
      const walletSessionUser = {
        id: "wallet:0x1234567890abcdef",
        authType: "wallet",
        name: "Wallet User",
      };

      userHooks.useSSOSessionQuery.mockReturnValue({
        data: { user: walletSessionUser, isSSO: false },
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      });

      wagmiHooks.useConnection.mockReturnValue({
        address: null,
        isConnected: false,
        isReconnecting: false,
        isConnecting: false,
      });

      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useUser(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/auth/wallet-logout",
          expect.objectContaining({ method: "POST" })
        );
        expect(result.current.isLoggedIn).toBe(false);
        expect(result.current.user).toBeNull();
      });
    });

    test("preserves SSO data when wallet disconnects", async () => {
      const testAddress = "0x1234567890abcdef";
      const mockSSOUser = { name: "SSO User", email: "test@uned.es" };

      userHooks.useSSOSessionQuery.mockReturnValue({
        data: { user: mockSSOUser, isSSO: true },
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      });

      wagmiHooks.useConnection.mockReturnValue({
        accounts: [testAddress],
        chain: { id: 11155111, name: "sepolia" },
        status: "connected",
      });

      const queryClient = createTestQueryClient();
      const { result, rerender } = renderHook(() => useUser(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isSSO).toBe(true);
        expect(result.current.isConnected).toBe(true);
      });

      wagmiHooks.useConnection.mockReturnValue({
        address: null,
        isConnected: false,
        isReconnecting: false,
        isConnecting: false,
      });

      rerender();

      await waitFor(() => {
        expect(result.current.isSSO).toBe(true);
        expect(result.current.isLoggedIn).toBe(true);
        expect(result.current.user?.name).toBe("SSO User");
      });
    });
  });

  describe("Provider Status", () => {
    test("identifies user as provider when status is true", async () => {
      const testAddress = "0x1234567890abcdef";

      wagmiHooks.useConnection.mockReturnValue({
        accounts: [testAddress],
        chain: { id: 11155111, name: "sepolia" },
        status: "connected",
      });

      userHooks.useIsLabProvider.mockReturnValue({
        data: { isLabProvider: true },
        isLoading: false,
        error: null,
      });

      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useUser(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isProvider).toBe(true);
        expect(result.current.user?.isProvider).toBe(true);
      });
    });

    test("fetches provider details when user is provider", async () => {
      const testAddress = "0xprovider123";

      wagmiHooks.useConnection.mockReturnValue({
        accounts: [testAddress],
        chain: { id: 11155111, name: "sepolia" },
        status: "connected",
      });

      userHooks.useIsLabProvider.mockReturnValue({
        data: { isLabProvider: true },
        isLoading: false,
        error: null,
      });

      userHooks.useGetLabProviders.mockReturnValue({
        data: {
          providers: [{ account: testAddress, name: "Provider Lab Inc" }],
        },
        isLoading: false,
      });

      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useUser(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.user?.name).toBe("Provider Lab Inc");
      });
    });

    test("calls refreshProviderStatus function", async () => {
      const testAddress = "0x1234567890abcdef";
      const mockRefresh = jest.fn().mockResolvedValue(undefined);

      wagmiHooks.useConnection.mockReturnValue({
        accounts: [testAddress],
        chain: { id: 11155111, name: "sepolia" },
        status: "connected",
      });

      userHooks.useUserCacheUpdates.mockReturnValue({
        refreshProviderStatus: mockRefresh,
        clearSSOSession: jest.fn(),
      });

      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useUser(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        await result.current.refreshProviderStatus();
      });

      expect(mockRefresh).toHaveBeenCalledWith(testAddress);
    });

    test("does not fetch provider details when user is not provider", () => {
      const testAddress = "0x1234567890abcdef";

      wagmiHooks.useConnection.mockReturnValue({
        accounts: [testAddress],
        chain: { id: 11155111, name: "sepolia" },
        status: "connected",
      });

      userHooks.useIsLabProvider.mockReturnValue({
        data: { isLabProvider: false },
        isLoading: false,
        error: null,
      });

      const providersQuerySpy = jest.fn().mockReturnValue({
        data: null,
        isLoading: false,
      });
      userHooks.useGetLabProviders.mockImplementation(providersQuerySpy);

      const queryClient = createTestQueryClient();
      renderHook(() => useUser(), {
        wrapper: createWrapper(queryClient),
      });

      expect(providersQuerySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: false,
        })
      );
    });
  });

  describe("Error Handling", () => {
    test("filters out empty errors", async () => {
      userHooks.useSSOSessionQuery.mockReturnValue({
        data: null,
        isLoading: false,
        error: {},
        refetch: jest.fn(),
      });

      const queryClient = createTestQueryClient();
      renderHook(() => useUser(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(errorBoundaries.useErrorHandler().handleError).not.toHaveBeenCalled();
      });
    });

    test("filters out null errors", async () => {
      userHooks.useSSOSessionQuery.mockReturnValue({
        data: null,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      });

      const queryClient = createTestQueryClient();
      renderHook(() => useUser(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(errorBoundaries.useErrorHandler().handleError).not.toHaveBeenCalled();
      });
    });

    test("handles logout errors gracefully", async () => {
      userHooks.useSSOSessionQuery.mockReturnValue({
        data: { user: { name: "Test User" }, isSSO: true },
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      });

      global.fetch.mockRejectedValueOnce(new Error("Network error"));

      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useUser(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isSSO).toBe(true);
      });

      await act(async () => {
        const success = await result.current.logoutSSO();
        expect(success).toBe(true);
      });

      await waitFor(
        () => {
          expect(result.current.isSSO).toBe(false);
          expect(result.current.user).toBeNull();
        },
        { timeout: 5000 }
      );
    });
  });

  describe("Edge Cases", () => {
    test("shows loading when connected wallet is fetching provider status", () => {
      const testAddress = "0x1234567890abcdef";

      wagmiHooks.useConnection.mockReturnValue({
        accounts: [testAddress],
        chain: { id: 11155111, name: "sepolia" },
        status: "connected",
      });

      userHooks.useIsLabProvider.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
      });

      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useUser(), {
        wrapper: createWrapper(queryClient),
      });

      expect(result.current.isLoading).toBe(true);
    });

    test("handles combined SSO and wallet authentication", async () => {
      const testAddress = "0x1234567890abcdef";
      const mockSSOUser = {
        name: "SSO User",
        email: "test@uned.es",
        organizationName: "UNED",
      };

      userHooks.useSSOSessionQuery.mockReturnValue({
        data: { user: mockSSOUser, isSSO: true },
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      });

      wagmiHooks.useConnection.mockReturnValue({
        accounts: [testAddress],
        chain: { id: 11155111, name: "sepolia" },
        status: "connected",
      });

      userHooks.useIsLabProvider.mockReturnValue({
        data: { isLabProvider: true },
        isLoading: false,
        error: null,
      });

      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useUser(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isSSO).toBe(true);
        expect(result.current.isConnected).toBe(true);
        expect(result.current.isProvider).toBe(true);
        expect(result.current.user).toMatchObject({
          name: "SSO User",
          address: testAddress,
          institutionName: "UNED",
          isProvider: true,
        });
      });
    });

    test("prioritizes provider name over SSO name when available", async () => {
      const testAddress = "0xprovider123";

      userHooks.useSSOSessionQuery.mockReturnValue({
        data: {
          user: { name: "SSO Name", email: "test@example.com" },
          isSSO: true,
        },
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      });

      wagmiHooks.useConnection.mockReturnValue({
        accounts: [testAddress],
        chain: { id: 11155111, name: "sepolia" },
        status: "connected",
      });

      userHooks.useIsLabProvider.mockReturnValue({
        data: { isLabProvider: true },
        isLoading: false,
        error: null,
      });

      userHooks.useGetLabProviders.mockReturnValue({
        data: {
          providers: [{ account: testAddress, name: "Official Provider Name" }],
        },
        isLoading: false,
      });

      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useUser(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.user?.name).toBe("Official Provider Name");
      });
    });

    test("does not fetch provider status when wallet is loading", () => {
      wagmiHooks.useConnection.mockReturnValue({
        address: null,
        isConnected: false,
        isReconnecting: true,
        isConnecting: false,
      });

      const providerQuerySpy = jest.fn().mockReturnValue({
        data: null,
        isLoading: false,
        error: null,
      });
      userHooks.useIsLabProvider.mockImplementation(providerQuerySpy);

      const queryClient = createTestQueryClient();
      renderHook(() => useUser(), {
        wrapper: createWrapper(queryClient),
      });

      expect(providerQuerySpy).toHaveBeenCalledWith(
        null,
        expect.objectContaining({
          enabled: false,
        })
      );
    });
  });
});
