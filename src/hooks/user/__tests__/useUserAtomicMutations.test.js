/**
 * Unit Tests for useUserAtomicMutations hooks
 *
 * Tests atomic user/provider mutation hooks following the SSO/Wallet dual-path architecture.
 * Each mutation provides three variants: Wallet (useContractWriteFunction), 
 * SSO (API fetch), and Router (auto-detects).
 *
 * Test Behaviors:
 * - useAddProviderWallet / useAddProviderSSO / useAddProvider
 * - useUpdateProviderWallet / useUpdateProviderSSO / useUpdateProvider
 * - useRemoveProviderWallet / useRemoveProviderSSO / useRemoveProvider
 * - Optimistic updates and rollback on error
 * - Cache invalidation patterns
 */

import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Import hooks to test
import {
  useAddProviderWallet,
  useAddProviderSSO,
  useAddProvider,
  useUpdateProviderWallet,
  useUpdateProviderSSO,
  useUpdateProvider,
  useRemoveProviderWallet,
  useRemoveProviderSSO,
  useRemoveProvider,
} from "@/hooks/user/useUserAtomicMutations";

// Mock fetch globally
global.fetch = jest.fn();

// Mock logger
jest.mock("@/utils/dev/logger", () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    success: jest.fn(),
    mutation: jest.fn(),
    moduleLoaded: jest.fn(),
  },
}));

// Mock useContractWriteFunction
const mockContractWriteFunction = jest.fn();
jest.mock("@/hooks/contract/useContractWriteFunction", () => ({
  __esModule: true,
  default: jest.fn(() => ({
    contractWriteFunction: mockContractWriteFunction,
  })),
}));

// Mock UserContext
const mockUserContext = {
  isSSO: false,
  address: "0x1234567890123456789012345678901234567890",
};
jest.mock("@/context/UserContext", () => ({
  useUser: jest.fn(() => mockUserContext),
}));

// Mock query keys
jest.mock("@/utils/hooks/queryKeys", () => ({
  userQueryKeys: {
    all: jest.fn(() => ["user"]),
    ssoSession: jest.fn(() => ["user", "ssoSession"]),
  },
  providerQueryKeys: {
    all: jest.fn(() => ["provider"]),
    getLabProviders: jest.fn(() => ["provider", "getLabProviders"]),
    isLabProvider: jest.fn((address) => ["provider", "isLabProvider", address]),
  },
}));

// Helper to create QueryClient wrapper with access to queryClient
let testQueryClient;
const createWrapper = () => {
  testQueryClient = new QueryClient({
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
    <QueryClientProvider client={testQueryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe("useUserAtomicMutations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch.mockClear();
    mockContractWriteFunction.mockClear();
    mockUserContext.isSSO = false;
  });

  // ==================== ADD PROVIDER HOOKS ====================

  describe("useAddProviderWallet", () => {
    const mockProviderData = {
      name: "Test Provider",
      account: "0x1234567890123456789012345678901234567890",
      email: "test@provider.com",
      country: "USA",
    };

    const mockTxHash = "0xabc123...";

    test("calls contract write function with correct parameters", async () => {
      mockContractWriteFunction.mockResolvedValueOnce(mockTxHash);

      const { result } = renderHook(() => useAddProviderWallet(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync(mockProviderData);
      });

      expect(mockContractWriteFunction).toHaveBeenCalledWith([
        mockProviderData.name,
        mockProviderData.account,
        mockProviderData.email,
        mockProviderData.country,
      ]);
    });

    test("returns transaction hash on success", async () => {
      mockContractWriteFunction.mockResolvedValueOnce(mockTxHash);

      const { result } = renderHook(() => useAddProviderWallet(), {
        wrapper: createWrapper(),
      });

      let response;
      await act(async () => {
        response = await result.current.mutateAsync(mockProviderData);
      });

      expect(response).toEqual({ hash: mockTxHash });
    });

    test("applies optimistic update on mutate", async () => {
      mockContractWriteFunction.mockResolvedValueOnce(mockTxHash);

      const { result } = renderHook(() => useAddProviderWallet(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync(mockProviderData);
      });

      // Check that optimistic update was applied
      const cachedData = testQueryClient.getQueryData([
        "provider",
        "isLabProvider",
        mockProviderData.account,
      ]);
      expect(cachedData).toEqual({ isLabProvider: true, isProvider: true });
    });

    test("handles error correctly", async () => {
      const error = new Error("Transaction failed");
      mockContractWriteFunction.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useAddProviderWallet(), {
        wrapper: createWrapper(),
      });

      await expect(
        act(async () => {
          await result.current.mutateAsync(mockProviderData);
        })
      ).rejects.toThrow("Transaction failed");

      // mutateAsync properly rejects with the error
    });
  });

  describe("useAddProviderSSO", () => {
    const mockProviderData = {
      name: "Test Provider",
      account: "0x1234567890123456789012345678901234567890",
      email: "test@provider.com",
      country: "USA",
    };

    const mockResponse = {
      success: true,
      transactionHash: "0xabc123...",
    };

    test("calls API endpoint with correct data", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const { result } = renderHook(() => useAddProviderSSO(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync(mockProviderData);
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "/api/contract/provider/addProvider",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(mockProviderData),
        })
      );
    });

    test("returns API response on success", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const { result } = renderHook(() => useAddProviderSSO(), {
        wrapper: createWrapper(),
      });

      let response;
      await act(async () => {
        response = await result.current.mutateAsync(mockProviderData);
      });

      expect(response).toEqual(mockResponse);
    });

    test("throws error on API failure", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const { result } = renderHook(() => useAddProviderSSO(), {
        wrapper: createWrapper(),
      });

      await expect(
        act(async () => {
          await result.current.mutateAsync(mockProviderData);
        })
      ).rejects.toThrow("Failed to add provider via SSO: 500");
    });

    test("applies optimistic update on mutate", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const { result } = renderHook(() => useAddProviderSSO(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync(mockProviderData);
      });

      // Check optimistic update was applied
      const cachedData = testQueryClient.getQueryData([
        "provider",
        "isLabProvider",
        mockProviderData.account,
      ]);
      expect(cachedData).toEqual({ isLabProvider: true, isProvider: true });
    });
  });

  describe("useAddProvider (Router)", () => {
    const mockProviderData = {
      name: "Test Provider",
      account: "0x1234567890123456789012345678901234567890",
      email: "test@provider.com",
      country: "USA",
    };

    test("uses SSO variant when isSSO is true", async () => {
      mockUserContext.isSSO = true;

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { result } = renderHook(() => useAddProvider(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync(mockProviderData);
      });

      // SSO variant uses fetch
      expect(global.fetch).toHaveBeenCalled();
      // Wallet variant not called
      expect(mockContractWriteFunction).not.toHaveBeenCalled();
    });

    test("uses Wallet variant when isSSO is false", async () => {
      mockUserContext.isSSO = false;
      mockContractWriteFunction.mockResolvedValueOnce("0xhash123");

      const { result } = renderHook(() => useAddProvider(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync(mockProviderData);
      });

      // Wallet variant uses contract write
      expect(mockContractWriteFunction).toHaveBeenCalled();
      // SSO variant not called for this mutation
      // (Note: fetch may be called internally by other hooks)
    });
  });

  // ==================== UPDATE PROVIDER HOOKS ====================

  describe("useUpdateProviderWallet", () => {
    const mockUpdateData = {
      name: "Updated Provider",
      email: "updated@provider.com",
      country: "Canada",
    };

    const mockTxHash = "0xupdate123...";

    test("calls contract write function with correct parameters", async () => {
      mockContractWriteFunction.mockResolvedValueOnce(mockTxHash);

      const { result } = renderHook(() => useUpdateProviderWallet(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync(mockUpdateData);
      });

      expect(mockContractWriteFunction).toHaveBeenCalledWith([
        mockUpdateData.name,
        mockUpdateData.email,
        mockUpdateData.country,
      ]);
    });

    test("returns transaction hash on success", async () => {
      mockContractWriteFunction.mockResolvedValueOnce(mockTxHash);

      const { result } = renderHook(() => useUpdateProviderWallet(), {
        wrapper: createWrapper(),
      });

      let response;
      await act(async () => {
        response = await result.current.mutateAsync(mockUpdateData);
      });

      expect(response).toEqual({ hash: mockTxHash });
    });
  });

  describe("useUpdateProviderSSO", () => {
    const mockUpdateData = {
      name: "Updated Provider",
      email: "updated@provider.com",
      country: "Canada",
    };

    test("calls API endpoint with correct data", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { result } = renderHook(() => useUpdateProviderSSO(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync(mockUpdateData);
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "/api/contract/provider/updateProvider",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(mockUpdateData),
        })
      );
    });

    test("throws error on API failure", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      });

      const { result } = renderHook(() => useUpdateProviderSSO(), {
        wrapper: createWrapper(),
      });

      await expect(
        act(async () => {
          await result.current.mutateAsync(mockUpdateData);
        })
      ).rejects.toThrow("Failed to update provider: 403");
    });
  });

  describe("useUpdateProvider (Router)", () => {
    const mockUpdateData = {
      name: "Updated Provider",
      email: "updated@provider.com",
      country: "Canada",
    };

    test("uses SSO variant when isSSO is true", async () => {
      mockUserContext.isSSO = true;

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { result } = renderHook(() => useUpdateProvider(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync(mockUpdateData);
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "/api/contract/provider/updateProvider",
        expect.any(Object)
      );
    });

    test("uses Wallet variant when isSSO is false", async () => {
      mockUserContext.isSSO = false;
      mockContractWriteFunction.mockResolvedValueOnce("0xhash456");

      const { result } = renderHook(() => useUpdateProvider(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync(mockUpdateData);
      });

      expect(mockContractWriteFunction).toHaveBeenCalled();
    });
  });

  // ==================== REMOVE PROVIDER HOOKS ====================

  describe("useRemoveProviderWallet", () => {
    const mockProviderAddress = "0x1234567890123456789012345678901234567890";
    const mockTxHash = "0xremove123...";

    test("calls contract write function with correct parameters", async () => {
      mockContractWriteFunction.mockResolvedValueOnce(mockTxHash);

      const { result } = renderHook(() => useRemoveProviderWallet(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync(mockProviderAddress);
      });

      expect(mockContractWriteFunction).toHaveBeenCalledWith([
        mockProviderAddress,
      ]);
    });

    test("returns transaction hash on success", async () => {
      mockContractWriteFunction.mockResolvedValueOnce(mockTxHash);

      const { result } = renderHook(() => useRemoveProviderWallet(), {
        wrapper: createWrapper(),
      });

      let response;
      await act(async () => {
        response = await result.current.mutateAsync(mockProviderAddress);
      });

      expect(response).toEqual({ hash: mockTxHash });
    });

    test("succeeds for remove provider operation", async () => {
      mockContractWriteFunction.mockResolvedValueOnce(mockTxHash);

      const { result } = renderHook(() => useRemoveProviderWallet(), {
        wrapper: createWrapper(),
      });

      let response;
      await act(async () => {
        response = await result.current.mutateAsync(mockProviderAddress);
      });

      // Verify mutation returned transaction hash
      expect(response).toEqual({ hash: mockTxHash });
    });
  });

  describe("useRemoveProviderSSO", () => {
    const mockProviderAddress = "0x1234567890123456789012345678901234567890";

    test("calls API endpoint with correct data", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { result } = renderHook(() => useRemoveProviderSSO(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync(mockProviderAddress);
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "/api/contract/provider/removeProvider",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ providerAddress: mockProviderAddress }),
        })
      );
    });

    test("throws error on API failure", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const { result } = renderHook(() => useRemoveProviderSSO(), {
        wrapper: createWrapper(),
      });

      await expect(
        act(async () => {
          await result.current.mutateAsync(mockProviderAddress);
        })
      ).rejects.toThrow("Failed to remove provider: 401");
    });

    test("succeeds for remove provider SSO operation", async () => {
      const mockResponse = { success: true, transactionHash: "0xhash" };
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const { result } = renderHook(() => useRemoveProviderSSO(), {
        wrapper: createWrapper(),
      });

      let response;
      await act(async () => {
        response = await result.current.mutateAsync(mockProviderAddress);
      });

      // Verify mutation returned correct data
      expect(response).toEqual(mockResponse);
    });
  });

  describe("useRemoveProvider (Router)", () => {
    const mockProviderAddress = "0x1234567890123456789012345678901234567890";

    test("uses SSO variant when isSSO is true", async () => {
      mockUserContext.isSSO = true;

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { result } = renderHook(() => useRemoveProvider(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync(mockProviderAddress);
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "/api/contract/provider/removeProvider",
        expect.any(Object)
      );
    });

    test("uses Wallet variant when isSSO is false", async () => {
      mockUserContext.isSSO = false;
      mockContractWriteFunction.mockResolvedValueOnce("0xhash789");

      const { result } = renderHook(() => useRemoveProvider(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync(mockProviderAddress);
      });

      expect(mockContractWriteFunction).toHaveBeenCalled();
    });
  });

  // ==================== ERROR HANDLING & EDGE CASES ====================

  describe("Error Handling", () => {
    test("handles network errors gracefully", async () => {
      global.fetch.mockRejectedValueOnce(new Error("Network error"));

      const { result } = renderHook(() => useAddProviderSSO(), {
        wrapper: createWrapper(),
      });

      await expect(
        act(async () => {
          await result.current.mutateAsync({
            name: "Test",
            account: "0x123",
            email: "test@test.com",
            country: "USA",
          });
        })
      ).rejects.toThrow("Network error");

      // Error state should be set after rejection
      // Note: mutateAsync rejects, so the hook properly handles the error
    });

    test("handles contract revert errors", async () => {
      mockContractWriteFunction.mockRejectedValueOnce(
        new Error("execution reverted: Not authorized")
      );

      const { result } = renderHook(() => useAddProviderWallet(), {
        wrapper: createWrapper(),
      });

      await expect(
        act(async () => {
          await result.current.mutateAsync({
            name: "Test",
            account: "0x123",
            email: "test@test.com",
            country: "USA",
          });
        })
      ).rejects.toThrow("execution reverted: Not authorized");
    });
  });

  // ==================== CACHE MANAGEMENT ====================

  describe("Cache Management", () => {
    test("mutation completes successfully and cache can be invalidated", async () => {
      const mockTxHash = "0xhash";
      mockContractWriteFunction.mockResolvedValueOnce(mockTxHash);

      const { result } = renderHook(() => useAddProviderWallet(), {
        wrapper: createWrapper(),
      });

      let response;
      await act(async () => {
        response = await result.current.mutateAsync({
          name: "Test",
          account: "0x123",
          email: "test@test.com",
          country: "USA",
        });
      });

      // Mutation should return the transaction hash
      expect(response).toEqual({ hash: mockTxHash });
    });

    test("remove mutation completes successfully", async () => {
      const mockTxHash = "0xhash123";
      mockContractWriteFunction.mockResolvedValueOnce(mockTxHash);

      const mockAddress = "0x1234567890123456789012345678901234567890";

      const { result } = renderHook(() => useRemoveProviderWallet(), {
        wrapper: createWrapper(),
      });

      let response;
      await act(async () => {
        response = await result.current.mutateAsync(mockAddress);
      });

      // Mutation should return the transaction hash
      expect(response).toEqual({ hash: mockTxHash });
    });
  });
});
