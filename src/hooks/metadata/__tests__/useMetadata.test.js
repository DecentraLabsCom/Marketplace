/**
 * Unit Tests for useMetadata hook
 *
 * Tests metadata retrieval hooks
 *
 * Test Behaviors:
 * - useMetadata (fetch metadata by URI)
 * - Configuration settings
 * - Error handling and composition
 */

import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useMetadata,
  METADATA_QUERY_CONFIG,
} from "@/hooks/metadata/useMetadata";

// Mock fetch globally
global.fetch = jest.fn();

// Mock logger
jest.mock("@/utils/dev/logger", () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    moduleLoaded: jest.fn(),
  },
}));

// Mock SSR safe utility
jest.mock("@/utils/hooks/ssrSafe", () => ({
  createSSRSafeQuery: jest.fn((queryFn, defaultValue) => {
    return (...args) => {
      if (typeof window === "undefined") return Promise.resolve(defaultValue);
      return queryFn(...args);
    };
  }),
}));

// Mock query keys
jest.mock("@/utils/hooks/queryKeys", () => ({
  metadataQueryKeys: {
    byUri: jest.fn((uri) => ["metadata", "byUri", uri]),
  },
}));

// Helper to create QueryClient wrapper
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, cacheTime: 0, staleTime: 0 } },
  });
  return ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("useMetadata", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch.mockClear();
  });

  test("METADATA_QUERY_CONFIG has correct settings", () => {
    expect(METADATA_QUERY_CONFIG).toEqual({
      staleTime: 2 * 60 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
      networkMode: "online",
    });
  });

  test("fetches metadata successfully", async () => {
    const uri = "ipfs://QmTest123";
    const mockMetadata = { name: "Test Lab", description: "Test" };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockMetadata,
    });

    const { result } = renderHook(() => useMetadata(uri), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockMetadata);
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/metadata?uri=${encodeURIComponent(uri)}`,
      expect.objectContaining({
        method: "GET",
        headers: { "Content-Type": "application/json" },
      })
    );
  });

  test("is disabled when uri is not provided", () => {
    const { result } = renderHook(() => useMetadata(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("exposes queryFn for composition", () => {
    expect(useMetadata.queryFn).toBeDefined();
    expect(typeof useMetadata.queryFn).toBe("function");
  });
});
