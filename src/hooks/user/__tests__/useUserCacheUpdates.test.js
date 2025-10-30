/**
 * Unit Tests for useUserCacheUpdates hook.
 *
 * Tests the user and provider cache management hook for React Query.
 *
 * Test Behaviors:
 *
 * - Provider Operations: Add, update, and remove providers
 * - User Operations: Update user data in cache
 * - SSO Session: Clear session data on logout
 * - Optimistic Operations: Add, replace, and remove optimistic providers
 * - Blockchain Integration: Refresh provider status from blockchain
 * - Edge Cases: Empty caches, missing addresses, error scenarios
 *
 */

import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useUserCacheUpdates } from "../useUserCacheUpdates";
import { userQueryKeys, providerQueryKeys } from "@/utils/hooks/queryKeys";
import { useIsLabProviderQuery } from "../useUserAtomicQueries";
import devLog from "@/utils/dev/logger";

// Mock query keys to isolate tests from actual implementation details
jest.mock("@/utils/hooks/queryKeys", () => ({
  userQueryKeys: {
    all: jest.fn(() => ["users"]),
    ssoSession: jest.fn(() => ["users", "sso-session"]),
    byAddress: jest.fn((address) => ["users", "address", address]),
  },
  providerQueryKeys: {
    all: jest.fn(() => ["providers"]),
    list: jest.fn(() => ["providers", "list"]),
    byAddress: jest.fn((address) => ["providers", "address", address]),
    isLabProvider: jest.fn((address) => [
      "providers",
      "is-lab-provider",
      address,
    ]),
  },
}));

// Mock the blockchain query to avoid real network calls during tests
jest.mock("../useUserAtomicQueries", () => ({
  useIsLabProviderQuery: {
    queryFn: jest.fn(),
  },
}));

// Mock logger to prevent console noise and verify log calls
jest.mock("@/utils/dev/logger");

describe("useUserCacheUpdates hook", () => {
  let queryClient;
  let wrapper;

  // Sample data representing typical provider and user entities
  const mockProvider = {
    address: "0xProvider123",
    account: "0xProvider123",
    name: "Test Provider",
    labs: ["lab-1", "lab-2"],
  };

  const mockUser = {
    address: "0xUser456",
    name: "Test User",
    email: "test@example.com",
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a new QueryClient for each test to ensure isolation
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    // Wrap the hook with QueryClientProvider to simulate React Query context
    wrapper = ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    // Mock logger methods to assert on logging behavior
    devLog.log = jest.fn();
    devLog.success = jest.fn();
    devLog.error = jest.fn();

    // Default mock implementation for successful provider status check
    useIsLabProviderQuery.queryFn.mockResolvedValue({
      isLabProvider: true,
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe("Adding Providers", () => {
    test("adds provider to providers list cache", () => {
      const { result } = renderHook(() => useUserCacheUpdates(), { wrapper });

      result.current.addProvider(mockProvider);

      const providersList = queryClient.getQueryData(["providers", "list"]);
      expect(providersList).toEqual([mockProvider]);
    });

    test("adds provider to specific provider cache by address", () => {
      const { result } = renderHook(() => useUserCacheUpdates(), { wrapper });

      result.current.addProvider(mockProvider);

      const specificProvider = queryClient.getQueryData([
        "providers",
        "address",
        "0xProvider123",
      ]);
      expect(specificProvider).toEqual(mockProvider);
    });

    test("sets isLabProvider flag in cache", () => {
      const { result } = renderHook(() => useUserCacheUpdates(), { wrapper });

      result.current.addProvider(mockProvider);

      const providerStatus = queryClient.getQueryData([
        "providers",
        "is-lab-provider",
        "0xProvider123",
      ]);
      expect(providerStatus.isLabProvider).toBe(true);
      expect(providerStatus.isProvider).toBe(true);
    });

    test("uses account field when address not present", () => {
      const providerWithAccount = { ...mockProvider, address: undefined };
      const { result } = renderHook(() => useUserCacheUpdates(), { wrapper });

      result.current.addProvider(providerWithAccount);

      const specificProvider = queryClient.getQueryData([
        "providers",
        "address",
        "0xProvider123",
      ]);
      expect(specificProvider).toBeDefined();
    });

    test("prepends new provider to existing providers", () => {
      queryClient.setQueryData(["providers", "list"], [mockProvider]);
      const { result } = renderHook(() => useUserCacheUpdates(), { wrapper });

      const newProvider = { ...mockProvider, address: "0xNewProvider" };
      result.current.addProvider(newProvider);

      const providersList = queryClient.getQueryData(["providers", "list"]);
      expect(providersList).toEqual([newProvider, mockProvider]);
    });
  });

  describe("Updating Providers", () => {
    test("updates provider in providers list by address", () => {
      queryClient.setQueryData(["providers", "list"], [mockProvider]);
      const { result } = renderHook(() => useUserCacheUpdates(), { wrapper });

      const updates = { name: "Updated Provider", labs: ["lab-3"] };
      result.current.updateProvider("0xProvider123", updates);

      const providersList = queryClient.getQueryData(["providers", "list"]);
      expect(providersList[0].name).toBe("Updated Provider");
      expect(providersList[0].labs).toEqual(["lab-3"]);
    });

    test("updates specific provider cache", () => {
      queryClient.setQueryData(
        ["providers", "address", "0xProvider123"],
        mockProvider
      );
      const { result } = renderHook(() => useUserCacheUpdates(), { wrapper });

      const updates = { name: "Updated Name" };
      result.current.updateProvider("0xProvider123", updates);

      const specificProvider = queryClient.getQueryData([
        "providers",
        "address",
        "0xProvider123",
      ]);
      expect(specificProvider.name).toBe("Updated Name");
    });

    test("matches provider by account when address does not match", () => {
      const providerWithAccount = { ...mockProvider, address: undefined };
      queryClient.setQueryData(["providers", "list"], [providerWithAccount]);
      const { result } = renderHook(() => useUserCacheUpdates(), { wrapper });

      result.current.updateProvider("0xProvider123", { name: "Updated" });

      const providersList = queryClient.getQueryData(["providers", "list"]);
      expect(providersList[0].name).toBe("Updated");
    });

    test("returns empty array when cache is empty", () => {
      const { result } = renderHook(() => useUserCacheUpdates(), { wrapper });

      result.current.updateProvider("0xProvider123", { name: "Test" });

      const providersList = queryClient.getQueryData(["providers", "list"]);
      expect(providersList).toEqual([]);
    });
  });

  describe("Removing Providers", () => {
    test("removes provider from providers list by address", () => {
      queryClient.setQueryData(["providers", "list"], [mockProvider]);
      const { result } = renderHook(() => useUserCacheUpdates(), { wrapper });

      result.current.removeProvider("0xProvider123");

      const providersList = queryClient.getQueryData(["providers", "list"]);
      expect(providersList).toEqual([]);
    });

    test("removes provider by account when address does not match", () => {
      const providerWithAccount = { ...mockProvider, address: undefined };
      queryClient.setQueryData(["providers", "list"], [providerWithAccount]);
      const { result } = renderHook(() => useUserCacheUpdates(), { wrapper });

      result.current.removeProvider("0xProvider123");

      const providersList = queryClient.getQueryData(["providers", "list"]);
      expect(providersList).toEqual([]);
    });

    test("handles removing from empty cache", () => {
      const { result } = renderHook(() => useUserCacheUpdates(), { wrapper });

      result.current.removeProvider("0xProvider123");

      const providersList = queryClient.getQueryData(["providers", "list"]);
      expect(providersList).toEqual([]);
    });
  });

  describe("User Operations", () => {
    test("updates user data in cache", () => {
      queryClient.setQueryData(["users", "address", "0xUser456"], mockUser);
      const { result } = renderHook(() => useUserCacheUpdates(), { wrapper });

      const updates = { name: "Updated User", email: "updated@example.com" };
      result.current.updateUser("0xUser456", updates);

      const user = queryClient.getQueryData(["users", "address", "0xUser456"]);
      expect(user.name).toBe("Updated User");
      expect(user.email).toBe("updated@example.com");
    });

    test("creates new user entry when cache is empty", () => {
      const { result } = renderHook(() => useUserCacheUpdates(), { wrapper });

      result.current.updateUser("0xUser456", mockUser);

      const user = queryClient.getQueryData(["users", "address", "0xUser456"]);
      expect(user).toEqual(mockUser);
    });
  });

  describe("SSO Session", () => {
    // Security-critical test: ensures complete session cleanup on logout
    test("clears SSO session from cache", () => {
      queryClient.setQueryData(["users", "sso-session"], {
        user: mockUser,
        isSSO: true,
      });
      const { result } = renderHook(() => useUserCacheUpdates(), { wrapper });

      result.current.clearSSOSession();

      const session = queryClient.getQueryData(["users", "sso-session"]);
      expect(session).toBeUndefined();
    });
  });

  describe("Refresh Provider Status", () => {
    // Critical integration test: verifies blockchain data fetching and cache update
    test("fetches and updates provider status from blockchain", async () => {
      const { result } = renderHook(() => useUserCacheUpdates(), { wrapper });

      const status = await result.current.refreshProviderStatus(
        "0xProvider123"
      );

      expect(useIsLabProviderQuery.queryFn).toHaveBeenCalledWith({
        userAddress: "0xProvider123",
      });
      expect(status.isLabProvider).toBe(true);
      expect(status.isProvider).toBe(true);
    });

    // Validates that fresh data from blockchain is correctly stored in cache
    test("updates cache with fresh provider status", async () => {
      const { result } = renderHook(() => useUserCacheUpdates(), { wrapper });

      await result.current.refreshProviderStatus("0xProvider123");

      const providerStatus = queryClient.getQueryData([
        "providers",
        "is-lab-provider",
        "0xProvider123",
      ]);
      expect(providerStatus.isLabProvider).toBe(true);
    });

    // Error handling test: ensures proper exception when required parameter is missing
    test("throws error when userAddress not provided", async () => {
      const { result } = renderHook(() => useUserCacheUpdates(), { wrapper });

      await expect(result.current.refreshProviderStatus()).rejects.toThrow(
        "userAddress is required"
      );
    });

    // Network failure scenario: tests error propagation from blockchain call
    test("handles fetch errors gracefully", async () => {
      useIsLabProviderQuery.queryFn.mockRejectedValue(
        new Error("Blockchain error")
      );
      const { result } = renderHook(() => useUserCacheUpdates(), { wrapper });

      await expect(
        result.current.refreshProviderStatus("0xProvider123")
      ).rejects.toThrow("Blockchain error");
    });
  });

  describe("Optimistic Providers", () => {
    test("adds optimistic provider with temporary id and flags", () => {
      const { result } = renderHook(() => useUserCacheUpdates(), { wrapper });

      const providerData = { address: "0xNew", name: "New Provider" };
      const optimisticProvider =
        result.current.addOptimisticProvider(providerData);

      expect(optimisticProvider.id).toContain("temp-");
      expect(optimisticProvider.isPending).toBe(true);
      expect(optimisticProvider.isProcessing).toBe(true);

      const providersList = queryClient.getQueryData(["providers", "list"]);
      expect(providersList).toHaveLength(1);
    });

    test("replaces optimistic provider with real provider data", () => {
      const optimisticProvider = {
        id: "temp-123",
        address: "0xTemp",
        isPending: true,
      };
      queryClient.setQueryData(["providers", "list"], [optimisticProvider]);

      const { result } = renderHook(() => useUserCacheUpdates(), { wrapper });

      result.current.replaceOptimisticProvider("temp-123", mockProvider);

      const providersList = queryClient.getQueryData(["providers", "list"]);
      expect(providersList[0].address).toBe("0xProvider123");
      expect(providersList[0].isPending).toBeUndefined();
    });

    test("removes optimistic provider from cache", () => {
      const optimisticProvider = { id: "temp-456", address: "0xTemp" };
      queryClient.setQueryData(
        ["providers", "list"],
        [optimisticProvider, mockProvider]
      );

      const { result } = renderHook(() => useUserCacheUpdates(), { wrapper });

      result.current.removeOptimisticProvider("temp-456");

      const providersList = queryClient.getQueryData(["providers", "list"]);
      expect(providersList).toHaveLength(1);
      expect(providersList[0].address).toBe("0xProvider123");
    });
  });

  describe("Edge Cases", () => {
    test("handles provider without address or account", () => {
      const providerNoAddress = { name: "Provider", labs: [] };
      const { result } = renderHook(() => useUserCacheUpdates(), { wrapper });

      result.current.addProvider(providerNoAddress);

      const providersList = queryClient.getQueryData(["providers", "list"]);
      expect(providersList).toHaveLength(1);
    });

    test("handles updating non-existent provider", () => {
      queryClient.setQueryData(["providers", "list"], [mockProvider]);
      const { result } = renderHook(() => useUserCacheUpdates(), { wrapper });

      result.current.updateProvider("0xNonExistent", { name: "Test" });

      const providersList = queryClient.getQueryData(["providers", "list"]);
      expect(providersList[0].name).toBe("Test Provider");
    });
  });
});
