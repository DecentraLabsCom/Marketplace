/**
 * Unit tests for useCreateBookingMutation
 *
 * Purpose:
 *  - Verify endpoint selection logic: wallet path when userAddress is present, SSO path otherwise.
 *  - Ensure cache invalidation runs after a successful wallet request.
 *
 * Notes:
 *  - React Query retries are disabled for deterministic behavior.
 *  - global.fetch is restored between tests to avoid cross-test contamination.
 */

import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCreateBookingMutation } from '../useBookingAtomicMutations';

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, wrapper };
}

describe('useCreateBookingMutation minimal tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete global.fetch;
  });

  afterEach(() => {
    if (global.fetch && global.fetch.mockRestore) global.fetch.mockRestore();
    delete global.fetch;
    jest.clearAllMocks();
  });

  test('wallet path: calls wallet endpoint and invalidates queries on success', async () => {
    // Simulate a successful wallet endpoint response
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ created: true }) })
    );

    const { qc, wrapper } = createWrapper();
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useCreateBookingMutation(), { wrapper });

    const vars = { labId: 'lab-1', start: 111, timeslot: 't1', userAddress: '0xU' };

    await act(async () => {
      await result.current.mutateAsync(vars);
    });

    // Wallet endpoint must be used when userAddress is provided
    expect(global.fetch).toHaveBeenCalledWith('/api/contract/reservation/reservationRequest', expect.any(Object));
    // React Query invalidation should be triggered as part of the success flow
    expect(invalidateSpy).toHaveBeenCalled();

    invalidateSpy.mockRestore();
  });

  test('SSO path: calls SSO endpoint and throws on non-ok response', async () => {
    // Simulate a failing SSO endpoint
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'bad' }) })
    );

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCreateBookingMutation(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ labId: 'lab-x', start: 1 })).rejects.toThrow('bad');
    });

    // SSO endpoint must be used when no userAddress is provided
    expect(global.fetch).toHaveBeenCalledWith('/api/contract/reservation/reservationRequestSSO', expect.any(Object));
  });
});
