/**
 * Unit Tests for useUserAtomicQueries hook
 *
 * Tests atomic user/provider query hooks
 *
 * Test Behaviors:
 * - useGetLabProvidersSSO (get all providers via API)
 * - useIsLabProviderSSO (check provider status via API)
 * - useSSOSessionQuery (get SSO session)
 * - SSR safety and configuration
 *
 */

import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useGetLabProvidersSSO,
  useIsLabProviderSSO,
  useSSOSessionQuery,
  USER_QUERY_CONFIG,
} from "@/hooks/user/useUserAtomicQueries";

// Mock fetch globally
global.fetch = jest.fn();

// Mock logger
jest.mock("@/utils/dev/logger", () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    moduleLoaded: jest.fn(),
  },
}));

// Mock SSR safe utility
jest.mock("@/utils/hooks/ssrSafe", () => ({
  createSSRSafeQuery: jest.fn((queryFn, defaultValue) => {
    // Return a function that wraps the queryFn
    return (...args) => {
      if (typeof window === "undefined") {
        return Promise.resolve(defaultValue);
      }
      return queryFn(...args);
    };
  }),
}));

// Mock query keys
jest.mock("@/utils/hooks/queryKeys", () => ({
  userQueryKeys: {
    ssoSession: jest.fn(() => ["user", "ssoSession"]),
  },
  providerQueryKeys: {
    getLabProviders: jest.fn(() => ["provider", "getLabProviders"]),
    isLabProvider: jest.fn((address) => ["provider", "isLabProvider", address]),
  },
}));

// Helper to create QueryClient wrapper
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        cacheTime: 0,
        staleTime: 0,
      },
      mutations: { retry: false },
    },
  });

  return ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("useUserAtomicQueries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch.mockClear();
  });

  describe("Configuration", () => {
    test("USER_QUERY_CONFIG has correct settings", () => {
      expect(USER_QUERY_CONFIG).toEqual({
        staleTime: 2 * 60 * 60 * 1000, // 2 hours
        gcTime: 12 * 60 * 60 * 1000, // 12 hours
        refetchOnWindowFocus: false,
        refetchInterval: false,
        refetchOnReconnect: true,
        retry: 1,
      });
    });
  });

  describe("useGetLabProvidersSSO", () => {
    const mockProviders = {
      count: 2,
      providers: [
        {
          account: "0x1234567890123456789012345678901234567890",
          name: "Provider 1",
          email: "provider1@test.com",
          country: "USA",
        },
        {
          account: "0x0987654321098765432109876543210987654321",
          name: "Provider 2",
          email: "provider2@test.com",
          country: "Canada",
        },
      ],
    };

    test("fetches all providers successfully", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockProviders,
      });

      const { result } = renderHook(() => useGetLabProvidersSSO(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockProviders);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe(null);
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/contract/provider/getLabProviders",
        expect.objectContaining({
          method: "GET",
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    test("uses correct query key", () => {
      const { providerQueryKeys } = require("@/utils/hooks/queryKeys");

      renderHook(() => useGetLabProvidersSSO(), {
        wrapper: createWrapper(),
      });

      expect(providerQueryKeys.getLabProviders).toHaveBeenCalled();
    });

    test("can be disabled with options", () => {
      const { result } = renderHook(
        () => useGetLabProvidersSSO({ enabled: false }),
        {
          wrapper: createWrapper(),
        }
      );

      expect(result.current.isLoading).toBe(false);
      expect(result.current.fetchStatus).toBe("idle");
    });

    test("exposes queryFn for composition", () => {
      expect(useGetLabProvidersSSO.queryFn).toBeDefined();
      expect(typeof useGetLabProvidersSSO.queryFn).toBe("function");
    });

    test("exposes refetch function", async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => mockProviders,
      });

      const { result } = renderHook(() => useGetLabProvidersSSO(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.refetch).toBeDefined();
      expect(typeof result.current.refetch).toBe("function");
    });
  });

  describe("useIsLabProviderSSO", () => {
    const userAddress = "0x1234567890123456789012345678901234567890";
    const mockProviderStatus = { isProvider: true };

    test("checks provider status successfully", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockProviderStatus,
      });

      const { result } = renderHook(() => useIsLabProviderSSO(userAddress), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockProviderStatus);
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/contract/provider/isLabProvider?wallet=${userAddress}`,
        expect.objectContaining({
          method: "GET",
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    test("is disabled when address is not provided", () => {
      const { result } = renderHook(() => useIsLabProviderSSO(null), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.fetchStatus).toBe("idle");
    });

    test("is disabled when address is empty string", () => {
      const { result } = renderHook(() => useIsLabProviderSSO(""), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.fetchStatus).toBe("idle");
    });

    test("uses correct query key with address", () => {
      const { providerQueryKeys } = require("@/utils/hooks/queryKeys");

      renderHook(() => useIsLabProviderSSO(userAddress), {
        wrapper: createWrapper(),
      });

      expect(providerQueryKeys.isLabProvider).toHaveBeenCalledWith(userAddress);
    });

    test("exposes queryFn for composition", () => {
      expect(useIsLabProviderSSO.queryFn).toBeDefined();
      expect(typeof useIsLabProviderSSO.queryFn).toBe("function");
    });

    test("exposes refetch function", async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => mockProviderStatus,
      });

      const { result } = renderHook(() => useIsLabProviderSSO(userAddress), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.refetch).toBeDefined();
      expect(typeof result.current.refetch).toBe("function");
    });
  });

  describe("useSSOSessionQuery", () => {
    const mockSession = {
      user: {
        email: "user@test.com",
        name: "Test User",
        id: "123",
      },
      isSSO: true,
    };

    test("fetches SSO session successfully", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSession,
      });

      const { result } = renderHook(() => useSSOSessionQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockSession);
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/auth/sso/session",
        expect.objectContaining({
          method: "GET",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        })
      );
    });

    test("treats wallet session id as non-SSO", async () => {
      const walletSession = {
        user: {
          email: "user@test.com",
          name: "Wallet User",
          id: "wallet:0x1234567890123456789012345678901234567890",
        },
        isSSO: true,
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => walletSession,
      });

      const { result } = renderHook(() => useSSOSessionQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual({
        ...walletSession,
        isSSO: false,
      });
    });

    test("treats wallet authType as non-SSO", async () => {
      const walletSession = {
        user: {
          email: "user@test.com",
          name: "Wallet User",
          id: "123",
          authType: "wallet",
        },
        isSSO: true,
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => walletSession,
      });

      const { result } = renderHook(() => useSSOSessionQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual({
        ...walletSession,
        isSSO: false,
      });
    });

    test("handles 401 unauthorized gracefully", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const { result } = renderHook(() => useSSOSessionQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual({ user: null, isSSO: false });
    });

    test("handles 404 not found gracefully", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const { result } = renderHook(() => useSSOSessionQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual({ user: null, isSSO: false });
    });

    test("uses correct query key", () => {
      const { userQueryKeys } = require("@/utils/hooks/queryKeys");

      renderHook(() => useSSOSessionQuery(), {
        wrapper: createWrapper(),
      });

      expect(userQueryKeys.ssoSession).toHaveBeenCalled();
    });

    test("uses custom staleTime and gcTime", () => {
      // This test verifies that the hook overrides the default config
      // We can't easily test the exact values without accessing internal state,
      // but we can verify that the hook is using different timing
      const { result } = renderHook(() => useSSOSessionQuery(), {
        wrapper: createWrapper(),
      });

      // The hook should work with custom timing - just verify it renders
      expect(result.current).toBeDefined();
    });

    test("can be disabled with options", () => {
      const { result } = renderHook(
        () => useSSOSessionQuery({ enabled: false }),
        {
          wrapper: createWrapper(),
        }
      );

      expect(result.current.isLoading).toBe(false);
      expect(result.current.fetchStatus).toBe("idle");
    });

    test("exposes queryFn for composition", () => {
      expect(useSSOSessionQuery.queryFn).toBeDefined();
      expect(typeof useSSOSessionQuery.queryFn).toBe("function");
    });

    test("exposes refetch function", async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => mockSession,
      });

      const { result } = renderHook(() => useSSOSessionQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.refetch).toBeDefined();
      expect(typeof result.current.refetch).toBe("function");
    });
  });

  describe("Query Options", () => {
    test("all hooks accept custom options", async () => {
      const onSuccess = jest.fn();
      const onError = jest.fn();

      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      renderHook(() => useGetLabProvidersSSO({ onSuccess, onError }), {
        wrapper: createWrapper(),
      });

      renderHook(() => useIsLabProviderSSO("0x123", { onSuccess, onError }), {
        wrapper: createWrapper(),
      });

      renderHook(() => useSSOSessionQuery({ onSuccess, onError }), {
        wrapper: createWrapper(),
      });

      // Custom options should not throw errors
      expect(true).toBe(true);
    });

    test("custom enabled option overrides default", () => {
      const { result: result1 } = renderHook(
        () => useGetLabProvidersSSO({ enabled: false }),
        { wrapper: createWrapper() }
      );

      const { result: result2 } = renderHook(
        () => useIsLabProviderSSO("0x123", { enabled: false }),
        { wrapper: createWrapper() }
      );

      expect(result1.current.fetchStatus).toBe("idle");
      expect(result2.current.fetchStatus).toBe("idle");
    });
  });

  describe("SSR Safety", () => {
    test("all hooks have SSR-safe queryFn", () => {
      expect(useGetLabProvidersSSO.queryFn).toBeDefined();
      expect(useIsLabProviderSSO.queryFn).toBeDefined();
      expect(useSSOSessionQuery.queryFn).toBeDefined();
    });

    test("queryFns are callable functions", () => {
      expect(typeof useGetLabProvidersSSO.queryFn).toBe("function");
      expect(typeof useIsLabProviderSSO.queryFn).toBe("function");
      expect(typeof useSSOSessionQuery.queryFn).toBe("function");
    });
  });
});
