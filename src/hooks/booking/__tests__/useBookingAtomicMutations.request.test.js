/**
 * Unit tests for reservation request mutations (atomic)
 *
 * Purpose:
 *  - Verify the essential behavior for wallet and SSO reservation requests:
 *    * Wallet: optimistic add -> contract write -> replace optimistic; rollback on error.
 *    * SSO: POST to SSO endpoint -> addBooking on success; throw on non-ok response.
 *
 * Notes:
 *  - External dependencies are mocked via centralized factories under src/test-utils/mocks/hooks.
 *  - Tests use a QueryClientProvider with retries disabled for deterministic behavior.
 *  - Mocks are reset between tests and global.fetch is cleaned up to avoid cross-test contamination.
 */

jest.mock('@/hooks/contract/useContractWriteFunction', () =>
  require('../../../test-utils/mocks/hooks/useContractWriteFunction')
);
jest.mock('../useBookingCacheUpdates', () =>
  require('../../../test-utils/mocks/hooks/useBookingCacheUpdates')
);

import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useReservationRequestWallet,
  useReservationRequestSSO,
} from '../useBookingAtomicMutations';

// match the export shape of the centralized mock factories
const { useBookingCacheUpdates: mockBookingCacheFactory } = require('../../../test-utils/mocks/hooks/useBookingCacheUpdates');
const mockContractWriteFactory = require('../../../test-utils/mocks/hooks/useContractWriteFunction');

/* Shared QueryClient wrapper for stable react-query behavior in tests */
function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

/* Small helper to create consistent booking-cache spies used across tests */
const makeBookingMocks = (overrides = {}) => ({
  addOptimisticBooking: jest.fn(() => ({ id: overrides.optId || 'opt-default' })),
  replaceOptimisticBooking: jest.fn(),
  removeOptimisticBooking: jest.fn(),
  invalidateAllBookings: jest.fn(),
  addBooking: jest.fn(),
  updateBooking: jest.fn(),
  ...overrides,
});

describe('useReservationRequest (minimal unit tests)', () => {
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

  test('wallet: optimistic add -> contract write -> replace optimistic (success)', async () => {
    const bookingMocks = makeBookingMocks({ optId: 'opt-1' });
    mockBookingCacheFactory.mockImplementation(() => bookingMocks);

    const contractWriteFn = jest.fn(() => Promise.resolve('0xTXHASH'));
    mockContractWriteFactory.mockImplementation(() => ({ contractWriteFunction: contractWriteFn }));

    const { result } = renderHook(() => useReservationRequestWallet(), { wrapper: createWrapper() });

    const req = { tokenId: 't1', start: 1000, end: 2000, userAddress: '0xabc' };

    let res;
    await act(async () => { res = await result.current.mutateAsync(req); });

    // Essential assertions: optimistic add occurred, contract called with expected args, optimistic replaced with tx info
    expect(bookingMocks.addOptimisticBooking).toHaveBeenCalledTimes(1);
    expect(contractWriteFn).toHaveBeenCalledWith([req.tokenId, req.start, req.end]);
    expect(res).toEqual(expect.objectContaining({ hash: '0xTXHASH', optimisticId: 'opt-1' }));
    expect(bookingMocks.replaceOptimisticBooking).toHaveBeenCalledWith('opt-1', expect.objectContaining({
      transactionHash: '0xTXHASH',
      status: 'pending',
    }));
    expect(bookingMocks.removeOptimisticBooking).not.toHaveBeenCalled();
  });

  test('wallet: contract error -> remove optimistic booking and throw', async () => {
    const bookingMocks = makeBookingMocks({ optId: 'opt-2' });
    mockBookingCacheFactory.mockImplementation(() => bookingMocks);

    const contractWriteFn = jest.fn(() => Promise.reject(new Error('chain error')));
    mockContractWriteFactory.mockImplementation(() => ({ contractWriteFunction: contractWriteFn }));

    const { result } = renderHook(() => useReservationRequestWallet(), { wrapper: createWrapper() });

    const req = { tokenId: 't2', start: 0, end: 10, userAddress: '0xdef' };

    await act(async () => {
      await expect(result.current.mutateAsync(req)).rejects.toThrow('chain error');
    });

    // Optimistic add then removal on error
    expect(bookingMocks.addOptimisticBooking).toHaveBeenCalledTimes(1);
    expect(bookingMocks.removeOptimisticBooking).toHaveBeenCalledWith('opt-2');
    expect(bookingMocks.replaceOptimisticBooking).not.toHaveBeenCalled();
  });

  test('SSO: fetch POST -> addBooking on success', async () => {
    const bookingMocks = makeBookingMocks();
    mockBookingCacheFactory.mockImplementation(() => bookingMocks);

    const fakeResponse = { reservationKey: 'rk-1', status: 'confirmed' };
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(fakeResponse) })
    );

    const { result } = renderHook(() => useReservationRequestSSO(), { wrapper: createWrapper() });

    const vars = { tokenId: 'tk1', start: 111, end: 222, userAddress: 'u1' };

    let out;
    await act(async () => { out = await result.current.mutateAsync(vars); });

    // Key assertions: correct endpoint/payload used, cache updated, and response returned
    expect(global.fetch).toHaveBeenCalledWith('/api/contract/reservation/reservationRequestSSO', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(vars),
    }));
    expect(bookingMocks.addBooking).toHaveBeenCalledWith(expect.objectContaining({
      reservationKey: fakeResponse.reservationKey,
      tokenId: vars.tokenId,
      status: fakeResponse.status,
    }));
    expect(out).toEqual(fakeResponse);
  });

  test('SSO: non-ok fetch -> throw and do not call addBooking', async () => {
    const bookingMocks = makeBookingMocks();
    mockBookingCacheFactory.mockImplementation(() => bookingMocks);

    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ error: 'boom' }) })
    );

    const { result } = renderHook(() => useReservationRequestSSO(), { wrapper: createWrapper() });

    const vars = { tokenId: 'tkX', start: 1, end: 2 };

    await act(async () => {
      await expect(result.current.mutateAsync(vars)).rejects.toThrow('Failed to create SSO reservation request: 500');
    });

    expect(bookingMocks.addBooking).not.toHaveBeenCalled();
  });
});
