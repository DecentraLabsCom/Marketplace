/**
 * Unit Tests for useUserAtomicMutations hooks (wallet-only).
 *
 * Test Behaviors:
 * - useAddProviderWallet / useUpdateProviderWallet / useRemoveProviderWallet
 * - Optimistic updates and rollback on error
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Import hooks to test
import {
  useAddProviderWallet,
  useUpdateProviderWallet,
  useRemoveProviderWallet,
} from "@/hooks/user/useUserAtomicMutations";

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

// Mock query keys
jest.mock("@/utils/hooks/queryKeys", () => ({
  providerQueryKeys: {
    all: jest.fn(() => ["provider"]),
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

describe("useUserAtomicMutations (wallet-only)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockContractWriteFunction.mockClear();
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

    test("supports authURI in parameters", async () => {
      mockContractWriteFunction.mockResolvedValueOnce(mockTxHash);
      const withAuth = { ...mockProviderData, authURI: "https://auth.example.com" };

      const { result } = renderHook(() => useAddProviderWallet(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync(withAuth);
      });

      expect(mockContractWriteFunction).toHaveBeenCalledWith([
        withAuth.name,
        withAuth.account,
        withAuth.email,
        withAuth.country,
        withAuth.authURI,
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

      const cachedData = testQueryClient.getQueryData([
        "provider",
        "isLabProvider",
        mockProviderData.account,
      ]);
      expect(cachedData).toEqual({ isLabProvider: true, isProvider: true });
    });

    test("rolls back optimistic update on error", async () => {
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

      await waitFor(() => {
        expect(
          testQueryClient.getQueryData([
            "provider",
            "isLabProvider",
            mockProviderData.account,
          ])
        ).toEqual({ isLabProvider: false, isProvider: false });
      });
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

    test("applies optimistic update on mutate", async () => {
      mockContractWriteFunction.mockResolvedValueOnce(mockTxHash);

      const { result } = renderHook(() => useRemoveProviderWallet(), {
        wrapper: createWrapper(),
      });

      const setSpy = jest.spyOn(testQueryClient, "setQueryData");

      await act(async () => {
        await result.current.mutateAsync(mockProviderAddress);
      });

      expect(setSpy).toHaveBeenCalledWith(
        ["provider", "isLabProvider", mockProviderAddress],
        { isLabProvider: false, isProvider: false }
      );
      setSpy.mockRestore();
    });
  });
});
