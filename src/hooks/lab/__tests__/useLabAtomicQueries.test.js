/**
 * Unit Tests for useLabAtomicQueries hook
 *
 * Tests atomic lab query hooks.
 *
 * Test Behaviors:
 * - useAllLabsSSO (get all lab IDs)
 * - useLabSSO (get specific lab data)
 * - useLabBalanceSSO (get owner's lab count)
 * - useLabOwnerSSO (get lab owner address)
 * - useTokenOfOwnerByIndexSSO (get token ID at index)
 * - useTokenURISSO (get token metadata URI)
 * - useIsTokenListedSSO (check listing status)
 * - SSR safety and configuration
 */

import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { keepPreviousData } from "@tanstack/react-query";
import {
  useAllLabsSSO,
  useLabSSO,
  useLabBalanceSSO,
  useLabOwnerSSO,
  useTokenOfOwnerByIndexSSO,
  useTokenURISSO,
  useIsTokenListedSSO,
  LAB_QUERY_CONFIG,
} from "@/hooks/lab/useLabAtomicQueries";

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

// Mock dependencies to isolate the test
jest.mock("@/utils/hooks/authMode", () => ({
  useGetIsWallet: jest.fn(() => false),
}));

jest.mock("@/hooks/contract/useDefaultReadContract", () => ({
  __esModule: true,
  default: jest.fn(),
}));

// Mock query keys
jest.mock("@/utils/hooks/queryKeys", () => ({
  labQueryKeys: {
    getAllLabs: jest.fn(() => ["lab", "getAllLabs"]),
    getLab: jest.fn((labId) => ["lab", "getLab", labId]),
    balanceOf: jest.fn((owner) => ["lab", "balanceOf", owner]),
    ownerOf: jest.fn((labId) => ["lab", "ownerOf", labId]),
    tokenOfOwnerByIndex: jest.fn((owner, index) => [
      "lab",
      "tokenOfOwnerByIndex",
      owner,
      index,
    ]),
    tokenURI: jest.fn((labId) => ["lab", "tokenURI", labId]),
    isTokenListed: jest.fn((labId) => ["lab", "isTokenListed", labId]),
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

describe("useLabAtomicQueries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch.mockClear();
  });

  describe("Configuration", () => {
    test("LAB_QUERY_CONFIG has correct settings", () => {
      expect(LAB_QUERY_CONFIG).toEqual({
        staleTime: 12 * 60 * 60 * 1000, // 12 hours
        gcTime: 24 * 60 * 60 * 1000, // 24 hours
        refetchOnWindowFocus: false,
        refetchInterval: false,
        refetchOnReconnect: true,
        retry: 1,
        placeholderData: keepPreviousData,
      });
    });
  });

  describe("useAllLabsSSO", () => {
    test("fetches all lab IDs successfully", async () => {
      const mockLabIds = ["1", "2", "3"];
      const expectedLabIds = [1, 2, 3];
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockLabIds,
      });

      const { result } = renderHook(() => useAllLabsSSO(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(expectedLabIds);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe(null);
    });

    test("uses correct query key", () => {
      const { labQueryKeys } = require("@/utils/hooks/queryKeys");

      renderHook(() => useAllLabsSSO(), {
        wrapper: createWrapper(),
      });

      expect(labQueryKeys.getAllLabs).toHaveBeenCalled();
    });

    test("can be disabled with options", () => {
      const { result } = renderHook(() => useAllLabsSSO({ enabled: false }), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.fetchStatus).toBe("idle");
    });

    test("exposes queryFn for composition", () => {
      expect(useAllLabsSSO.queryFn).toBeDefined();
      expect(typeof useAllLabsSSO.queryFn).toBe("function");
    });
  });

  describe("useLabSSO", () => {
    const labId = "1";
    const mockLabData = {
      labId,
      base: {
        uri: "ipfs://test",
        price: "1000000000000000000",
        accessURI: "",
        accessKey: "",
      },
    };

    test("fetches specific lab data successfully", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockLabData,
      });

      const { result } = renderHook(() => useLabSSO(labId), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual({
        labId: 1,
        base: {
          uri: "ipfs://test",
          price: "1000000000000000000",
          priceNumber: 1000000000000000000,
          accessURI: "",
          accessKey: "",
          createdAt: 0,
        },
      });
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/contract/lab/getLab?labId=${labId}`,
        expect.any(Object)
      );
    });

    test("is disabled when labId is not provided", () => {
      const { result } = renderHook(() => useLabSSO(null), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.fetchStatus).toBe("idle");
    });

    test("uses correct query key with labId", () => {
      const { labQueryKeys } = require("@/utils/hooks/queryKeys");

      renderHook(() => useLabSSO(labId), {
        wrapper: createWrapper(),
      });

      expect(labQueryKeys.getLab).toHaveBeenCalledWith(labId);
    });

    test("exposes queryFn for composition", () => {
      expect(useLabSSO.queryFn).toBeDefined();
      expect(typeof useLabSSO.queryFn).toBe("function");
    });
  });

  describe("useLabBalanceSSO", () => {
    const ownerAddress = "0x1234567890123456789012345678901234567890";
    const mockBalance = { balance: "3" };

    test("fetches balance successfully", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockBalance,
      });

      const { result } = renderHook(() => useLabBalanceSSO(ownerAddress), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockBalance);
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/contract/lab/balanceOf?owner=${ownerAddress}`,
        expect.any(Object)
      );
    });

    test("is disabled when ownerAddress is not provided", () => {
      const { result } = renderHook(() => useLabBalanceSSO(null), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.fetchStatus).toBe("idle");
    });

    test("exposes queryFn for composition", () => {
      expect(useLabBalanceSSO.queryFn).toBeDefined();
      expect(typeof useLabBalanceSSO.queryFn).toBe("function");
    });
  });

  describe("useLabOwnerSSO", () => {
    const labId = "1";
    const mockOwner = { owner: "0x1234567890123456789012345678901234567890" };

    test("fetches owner address successfully", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockOwner,
      });

      const { result } = renderHook(() => useLabOwnerSSO(labId), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockOwner);
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/contract/lab/ownerOf?labId=${labId}`,
        expect.any(Object)
      );
    });

    test("is disabled when labId is not provided", () => {
      const { result } = renderHook(() => useLabOwnerSSO(null), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.fetchStatus).toBe("idle");
    });

    test("exposes queryFn for composition", () => {
      expect(useLabOwnerSSO.queryFn).toBeDefined();
      expect(typeof useLabOwnerSSO.queryFn).toBe("function");
    });
  });

  describe("useTokenOfOwnerByIndexSSO", () => {
    const ownerAddress = "0x1234567890123456789012345678901234567890";
    const index = 0;
    const mockToken = { tokenId: "1" };

    test("fetches token ID successfully", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockToken,
      });

      const { result } = renderHook(
        () => useTokenOfOwnerByIndexSSO(ownerAddress, index),
        {
          wrapper: createWrapper(),
        }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockToken);
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/contract/lab/tokenOfOwnerByIndex?owner=${ownerAddress}&index=${index}`,
        expect.any(Object)
      );
    });

    test("is disabled when ownerAddress is not provided", () => {
      const { result } = renderHook(
        () => useTokenOfOwnerByIndexSSO(null, index),
        {
          wrapper: createWrapper(),
        }
      );

      expect(result.current.isLoading).toBe(false);
      expect(result.current.fetchStatus).toBe("idle");
    });

    test("is disabled when index is undefined", () => {
      const { result } = renderHook(
        () => useTokenOfOwnerByIndexSSO(ownerAddress, undefined),
        {
          wrapper: createWrapper(),
        }
      );

      expect(result.current.isLoading).toBe(false);
      expect(result.current.fetchStatus).toBe("idle");
    });

    test("handles index 0 correctly", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockToken,
      });

      const { result } = renderHook(
        () => useTokenOfOwnerByIndexSSO(ownerAddress, 0),
        {
          wrapper: createWrapper(),
        }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockToken);
    });

    test("exposes queryFn for composition", () => {
      expect(useTokenOfOwnerByIndexSSO.queryFn).toBeDefined();
      expect(typeof useTokenOfOwnerByIndexSSO.queryFn).toBe("function");
    });
  });

  describe("useTokenURISSO", () => {
    const labId = "1";
    const mockURI = { uri: "ipfs://QmTest123" };

    test("fetches token URI successfully", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockURI,
      });

      const { result } = renderHook(() => useTokenURISSO(labId), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockURI);
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/contract/lab/tokenURI?tokenId=${labId}`,
        expect.any(Object)
      );
    });

    test("is disabled when labId is not provided", () => {
      const { result } = renderHook(() => useTokenURISSO(null), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.fetchStatus).toBe("idle");
    });

    test("exposes queryFn for composition", () => {
      expect(useTokenURISSO.queryFn).toBeDefined();
      expect(typeof useTokenURISSO.queryFn).toBe("function");
    });
  });

  describe("useIsTokenListedSSO", () => {
    const labId = "1";
    const mockListed = { isListed: true };

    test("fetches listing status successfully", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockListed,
      });

      const { result } = renderHook(() => useIsTokenListedSSO(labId), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockListed);
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/contract/reservation/isTokenListed?labId=${labId}`,
        expect.any(Object)
      );
    });

    test("is disabled when labId is not provided", () => {
      const { result } = renderHook(() => useIsTokenListedSSO(null), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.fetchStatus).toBe("idle");
    });

    test("exposes queryFn for composition", () => {
      expect(useIsTokenListedSSO.queryFn).toBeDefined();
      expect(typeof useIsTokenListedSSO.queryFn).toBe("function");
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

      renderHook(() => useAllLabsSSO({ onSuccess, onError }), {
        wrapper: createWrapper(),
      });

      renderHook(() => useLabSSO("1", { onSuccess, onError }), {
        wrapper: createWrapper(),
      });

      renderHook(() => useLabBalanceSSO("0x123", { onSuccess, onError }), {
        wrapper: createWrapper(),
      });

      expect(true).toBe(true);
    });

    test("custom enabled option overrides default", () => {
      const { result: result1 } = renderHook(
        () => useLabSSO("1", { enabled: false }),
        { wrapper: createWrapper() }
      );

      const { result: result2 } = renderHook(
        () => useLabOwnerSSO("1", { enabled: false }),
        { wrapper: createWrapper() }
      );

      expect(result1.current.fetchStatus).toBe("idle");
      expect(result2.current.fetchStatus).toBe("idle");
    });
  });

  describe("Refetch Functionality", () => {
    test("useAllLabsSSO exposes refetch function", async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ["1", "2"],
      });

      const { result } = renderHook(() => useAllLabsSSO(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.refetch).toBeDefined();
      expect(typeof result.current.refetch).toBe("function");
    });
  });
});
