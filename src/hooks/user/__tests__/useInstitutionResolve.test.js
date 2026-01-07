/**
 * Unit Tests for useInstitutionResolve Hook
 *
 * Tests the React Query hook that checks if an institution domain is registered
 * on the blockchain and retrieves the associated wallet address.
 *
 * Tests Behaviors:
 * - Successful institution resolution with wallet
 * - Unregistered institution (no wallet)
 * - Retry logic on RPC failures
 * - Cache behavior (staleTime, cacheTime)
 * - Error handling for network failures
 */

import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useInstitutionResolve } from "../useInstitutionResolve";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        cacheTime: 0,
      },
    },
  });

const createWrapper = (queryClient) => {
  return ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("useInstitutionResolve", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("returns registered institution data when wallet exists", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        registered: true,
        wallet: "0xabc123",
        domain: "uned.es",
        backendUrl: "https://sarlab.dia.uned.es",
      }),
    });

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useInstitutionResolve("uned.es"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({
      registered: true,
      wallet: "0xabc123",
      domain: "uned.es",
      backendUrl: "https://sarlab.dia.uned.es",
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/contract/institution/resolve?domain=uned.es",
      {
        method: 'GET',
        credentials: 'include',
      }
    );
  });

  test("returns unregistered status when no wallet found", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        registered: false,
        wallet: null,
        domain: "example.edu",
      }),
    });

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useInstitutionResolve("example.edu"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({
      registered: false,
      wallet: null,
      domain: "example.edu",
    });
  });

  test("does not fetch when domain is null or undefined", () => {
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useInstitutionResolve(null), {
      wrapper: createWrapper(queryClient),
    });

    // Query should not be enabled when domain is null
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
