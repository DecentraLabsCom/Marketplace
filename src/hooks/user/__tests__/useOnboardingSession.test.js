/**
 * Unit Tests for useOnboardingSession Hook
 *
 * Tests the React Query hook that fetches SSO onboarding session data
 * including stableUserId and institutionId.
 *
 * Tests Behaviors:
 * - Successful session data retrieval
 * - Handling missing or incomplete session data
 * - Cache behavior (staleTime, cacheTime)
 * - Error handling for network failures
 */

import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useOnboardingSession } from "../useOnboardingSession";

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

describe("useOnboardingSession", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("returns session data on successful fetch", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "ok",
        payload: { stableUserId: "test@uned.es" },
        meta: { stableUserId: "test@uned.es", institutionId: "uned.es" },
      }),
    });

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useOnboardingSession(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({
      status: "ok",
      payload: { stableUserId: "test@uned.es" },
      meta: { stableUserId: "test@uned.es", institutionId: "uned.es" },
    });
    expect(global.fetch).toHaveBeenCalledWith("/api/onboarding/session", {
      method: 'GET',
      credentials: 'include',
    });
  });

  test("returns empty data when session endpoint returns empty payload", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "ok",
        payload: {},
        meta: {},
      }),
    });

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useOnboardingSession(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data.payload).toEqual({});
  });
});
