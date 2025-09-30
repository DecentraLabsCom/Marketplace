/**
 * useReservationRequest — unified selection tests (SSO vs Wallet)
 *
 * Verifies:
 *  - SSO users trigger the SSO mutation (POST + addBooking).
 *  - Wallet users trigger the Wallet mutation (optimistic add + contract write).
 *
 * Notes:
 *  - External dependencies are mocked via centralized factories under src/test-utils/mocks/hooks.
 *  - The useUser hook is toggled to simulate SSO vs Wallet users.
 *  - React Query retries are disabled for deterministic tests.
 */

jest.mock('@/hooks/contract/useContractWriteFunction', () =>
  require('../../test-utils/mocks/hooks/useContractWriteFunction')
);
jest.mock('./useBookingCacheUpdates', () =>
  require('../../test-utils/mocks/hooks/useBookingCacheUpdates')
);
jest.mock('@/context/UserContext', () => ({
  useUser: jest.fn(() => ({ isSSO: true })),
}));

import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useReservationRequest } from './useBookingAtomicMutations';

const mockContractWriteFactory = require('../../test-utils/mocks/hooks/useContractWriteFunction');
const { useBookingCacheUpdates: mockBookingCacheFactory } = require('../../test-utils/mocks/hooks/useBookingCacheUpdates');

/* Shared QueryClient wrapper */
function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

/* Small helper to toggle useUser mock */
function setUserSSO(isSSO) {
  const userModule = require('@/context/UserContext');
  userModule.useUser.mockReturnValue({ isSSO });
}

describe('useReservationRequest unified selection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete global.fetch;
  });

  afterEach(() => {
    // ensure fetch cleaned up between tests
    if (global.fetch && global.fetch.mockRestore) global.fetch.mockRestore();
    delete global.fetch;
    jest.clearAllMocks();
  });

  test('SSO path: uses fetch and calls addBooking', async () => {
    setUserSSO(true);

    const addBooking = jest.fn();
    mockBookingCacheFactory.mockImplementation(() => ({ addBooking }));

    const fakeResponse = { reservationKey: 'rk-u-1' };
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(fakeResponse) }));

    const { result } = renderHook(() => useReservationRequest(), { wrapper: createWrapper() });

    const vars = { tokenId: 'tU1', start: 10, end: 20 };

    let out;
    await act(async () => { out = await result.current.mutateAsync(vars); });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(addBooking).toHaveBeenCalledTimes(1);
    expect(out).toEqual(fakeResponse);
  });

  test('Wallet path: optimistic add then contract write', async () => {
    setUserSSO(false);

    const addOptimisticBooking = jest.fn(() => ({ id: 'opt-u-1' }));
    const replaceOptimisticBooking = jest.fn();
    const removeOptimisticBooking = jest.fn();
    const invalidateAllBookings = jest.fn();

    mockBookingCacheFactory.mockImplementation(() => ({
      addOptimisticBooking,
      replaceOptimisticBooking,
      removeOptimisticBooking,
      invalidateAllBookings,
    }));

    const contractWriteFn = jest.fn(() => Promise.resolve('0xUNHASH'));
    mockContractWriteFactory.mockImplementation(() => ({ contractWriteFunction: contractWriteFn }));

    const { result } = renderHook(() => useReservationRequest(), { wrapper: createWrapper() });

    const vars = { tokenId: 'tU2', start: 1, end: 2, userAddress: '0xU' };

    let out;
    await act(async () => { out = await result.current.mutateAsync(vars); });

    expect(addOptimisticBooking).toHaveBeenCalledTimes(1);
    expect(contractWriteFn).toHaveBeenCalledTimes(1);
    expect(replaceOptimisticBooking).toHaveBeenCalledWith('opt-u-1', expect.objectContaining({
      status: 'pending',
      transactionHash: '0xUNHASH',
    }));
    expect(out).toEqual(expect.objectContaining({ hash: '0xUNHASH', optimisticId: 'opt-u-1' }));
    expect(removeOptimisticBooking).not.toHaveBeenCalled();
  });
});
