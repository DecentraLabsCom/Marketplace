/**
 * Fallback invalidation test for useReservationRequestWallet
 *
 * Purpose:
 *  - Ensure that when replaceOptimisticBooking throws inside onSuccess,
 *    the hook performs a safe fallback: calls invalidateAllBookings and
 *    triggers react-query's invalidateQueries to refresh relevant caches.
 *
 * Notes:
 *  - External dependencies are mocked via centralized factories located in src/test-utils/mocks/hooks.
 *  - React Query retries are disabled to keep the test deterministic.
 *  - We spy on the QueryClient.invalidateQueries method to confirm it runs.
 */

jest.mock('@/hooks/contract/useContractWriteFunction', () =>
  require('../../test-utils/mocks/hooks/useContractWriteFunction')
);
jest.mock('./useBookingCacheUpdates', () =>
  require('../../test-utils/mocks/hooks/useBookingCacheUpdates')
);

import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useReservationRequestWallet } from './useBookingAtomicMutations';

const mockContractWriteFactory = require('../../test-utils/mocks/hooks/useContractWriteFunction');
const { useBookingCacheUpdates: mockBookingCacheFactory } = require('../../test-utils/mocks/hooks/useBookingCacheUpdates');

/* Shared QueryClient wrapper that disables retries for deterministic tests */
function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, wrapper };
}

describe('useReservationRequestWallet - fallback invalidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete global.fetch;
  });

  afterEach(() => {
    // Ensure no leftover fetch mock persists between tests
    if (global.fetch && global.fetch.mockRestore) global.fetch.mockRestore();
    delete global.fetch;
    jest.clearAllMocks();
  });

  test('if replaceOptimisticBooking throws, fallback invalidation runs', async () => {
    const { qc, wrapper } = createWrapper();

    // Simulate optimistic add returning an optimistic id
    const addOptimisticBooking = jest.fn(() => ({ id: 'opt-fb-1' }));
    // Simulate replace throwing to trigger the fallback path
    const replaceOptimisticBooking = jest.fn(() => { throw new Error('replace failed'); });
    const removeOptimisticBooking = jest.fn();
    const invalidateAllBookings = jest.fn();

    mockBookingCacheFactory.mockImplementation(() => ({
      addOptimisticBooking,
      replaceOptimisticBooking,
      removeOptimisticBooking,
      invalidateAllBookings,
    }));

    // Normal contract write resolves to a tx hash
    const contractWriteFn = jest.fn(() => Promise.resolve('0xHASHFB'));
    mockContractWriteFactory.mockImplementation(() => ({ contractWriteFunction: contractWriteFn }));

    // Spy on QueryClient.invalidateQueries to verify fallback triggers a global refetch
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useReservationRequestWallet(), { wrapper });

    const vars = { tokenId: 't-fb', start: 1, end: 2, userAddress: '0xFB' };

    // Run mutation; onSuccess contains try/catch, so it should not throw despite replace throwing
    await act(async () => {
      await result.current.mutateAsync(vars);
    });

    // Core expectations: optimistic add and contract write happened
    expect(addOptimisticBooking).toHaveBeenCalledTimes(1);
    expect(contractWriteFn).toHaveBeenCalledWith([vars.tokenId, vars.start, vars.end]);

    // Fallback must run: cache-level invalidation and react-query invalidation
    expect(invalidateAllBookings).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalled();

    invalidateSpy.mockRestore();
  });
});

