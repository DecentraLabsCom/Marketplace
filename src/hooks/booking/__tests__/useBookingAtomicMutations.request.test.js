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
jest.mock('@/utils/webauthn/client', () => ({
  transformAssertionOptions: jest.fn((opts) => opts),
  assertionToJSON: jest.fn(() => ({
    response: {
      clientDataJSON: 'cd',
      authenticatorData: 'ad',
      signature: 'sig',
    },
  })),
}));

import { renderHook, act } from '@testing-library/react';

// Mock optimistic UI context helpers
const mockSetOptimisticBookingState = jest.fn();
const mockCompleteOptimisticBookingState = jest.fn();
const mockClearOptimisticBookingState = jest.fn();

jest.mock('@/context/OptimisticUIContext', () => ({
  useOptimisticUI: () => ({
    setOptimisticBookingState: mockSetOptimisticBookingState,
    completeOptimisticBookingState: mockCompleteOptimisticBookingState,
    clearOptimisticBookingState: mockClearOptimisticBookingState,
  }),
}));
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useReservationRequestWallet,
  useReservationRequestSSO,
} from '../useBookingAtomicMutations';
import { bookingQueryKeys } from '@/utils/hooks/queryKeys';

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
    global.window = { PublicKeyCredential: true };
    global.navigator = {
      credentials: { get: jest.fn(() => Promise.resolve({})) },
    };
  });

  afterEach(() => {
    // Ensure no leftover fetch mock persists between tests
    if (global.fetch && global.fetch.mockRestore) global.fetch.mockRestore();
    delete global.fetch;
    jest.clearAllMocks();
    delete global.window;
    delete global.navigator;
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

    // Optimistic UI state should be set
    expect(mockSetOptimisticBookingState).toHaveBeenCalledWith('opt-1', expect.objectContaining({ status: 'requesting' }));

    expect(contractWriteFn).toHaveBeenCalledWith([req.tokenId, req.start, req.end]);
    expect(res).toEqual(expect.objectContaining({ hash: '0xTXHASH', optimisticId: 'opt-1' }));
    expect(bookingMocks.replaceOptimisticBooking).toHaveBeenCalledWith('opt-1', expect.objectContaining({
      transactionHash: '0xTXHASH',
      status: 'pending',
    }));

    // Optimistic UI should be completed after tx sent
    expect(mockCompleteOptimisticBookingState).toHaveBeenCalledWith('opt-1');

    expect(bookingMocks.removeOptimisticBooking).not.toHaveBeenCalled();
  });

  test('wallet: replace failure triggers targeted invalidations', async () => {
    const bookingMocks = makeBookingMocks({
      optId: 'opt-err',
      replaceOptimisticBooking: jest.fn(() => {
        throw new Error('replace failed');
      }),
    });
    mockBookingCacheFactory.mockImplementation(() => bookingMocks);

    const contractWriteFn = jest.fn(() => Promise.resolve('0xHASHERR'));
    mockContractWriteFactory.mockImplementation(() => ({ contractWriteFunction: contractWriteFn }));

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');

    const Wrapper = ({ children }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useReservationRequestWallet(), { wrapper: Wrapper });

    const req = { tokenId: 'tok-err', start: 5, end: 6, userAddress: '0xerr' };

    let res;
    await act(async () => { res = await result.current.mutateAsync(req); });

    // replace throws, so we fallback to invalidations
    expect(res).toEqual(expect.objectContaining({ hash: '0xHASHERR', optimisticId: 'opt-err' }));
    expect(bookingMocks.invalidateAllBookings).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: bookingQueryKeys.getReservationsOfToken(req.tokenId) });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: bookingQueryKeys.hasActiveBookingByToken(req.tokenId, req.userAddress),
    });
  });

  test('wallet: BigInt tx hash gets normalized to string', async () => {
    const bookingMocks = makeBookingMocks({ optId: 'opt-bigint' });
    mockBookingCacheFactory.mockImplementation(() => bookingMocks);

    const contractWriteFn = jest.fn(() => Promise.resolve(1234n));
    mockContractWriteFactory.mockImplementation(() => ({ contractWriteFunction: contractWriteFn }));

    const { result } = renderHook(() => useReservationRequestWallet(), { wrapper: createWrapper() });

    await act(async () => { await result.current.mutateAsync({ tokenId: 'tB', start: 1, end: 2 }); });

    expect(bookingMocks.replaceOptimisticBooking).toHaveBeenCalledWith('opt-bigint', expect.objectContaining({
      transactionHash: '1234',
    }));
  });

  test('wallet: invalidateAllBookings throw still triggers targeted invalidations', async () => {
    const bookingMocks = makeBookingMocks({
      optId: 'opt-fallback',
      replaceOptimisticBooking: jest.fn(() => { throw new Error('replace fail'); }),
      invalidateAllBookings: jest.fn(() => { throw new Error('invalidate boom'); }),
    });
    mockBookingCacheFactory.mockImplementation(() => bookingMocks);

    const contractWriteFn = jest.fn(() => Promise.resolve('0xFALLBACK'));
    mockContractWriteFactory.mockImplementation(() => ({ contractWriteFunction: contractWriteFn }));

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');

    const Wrapper = ({ children }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useReservationRequestWallet(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        tokenId: 'tok-f',
        start: 10,
        end: 11,
        userAddress: '0xfallback',
      });
    });

    expect(bookingMocks.invalidateAllBookings).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: bookingQueryKeys.getReservationsOfToken('tok-f') });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: bookingQueryKeys.hasActiveBookingByToken('tok-f', '0xfallback'),
    });
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

    // Optimistic UI state should be cleared on chain error
    expect(mockClearOptimisticBookingState).toHaveBeenCalledWith('opt-2');

    expect(bookingMocks.removeOptimisticBooking).toHaveBeenCalledWith('opt-2');
    expect(bookingMocks.replaceOptimisticBooking).not.toHaveBeenCalled();
  });

  test('SSO: prepare/finalize intent -> addBooking on success', async () => {
    const bookingMocks = makeBookingMocks();
    mockBookingCacheFactory.mockImplementation(() => bookingMocks);

    const preparePayload = {
      ok: true,
      json: () =>
        Promise.resolve({
          webauthnChallenge: 'challenge',
          allowCredentials: [],
          intent: {
            meta: { requestId: 'req-1' },
            payload: { reservationKey: 'rk-1' },
          },
          adminSignature: '0xadmin',
          webauthnCredentialId: 'cred',
        }),
    };
    const finalizePayload = {
      ok: true,
      json: () =>
        Promise.resolve({
          intent: { meta: { requestId: 'req-1' }, payload: { reservationKey: 'rk-1' } },
          status: 'dispatched',
        }),
    };
    global.fetch = jest.fn()
      .mockResolvedValueOnce(preparePayload)
      .mockResolvedValueOnce(finalizePayload);

    const { result } = renderHook(() => useReservationRequestSSO(), { wrapper: createWrapper() });

    const vars = { tokenId: 'tk1', start: 111, end: 222, userAddress: 'u1' };

    let out;
    await act(async () => { out = await result.current.mutateAsync(vars); });

    // Key assertions: prepare/finalize called, cache updated, and response returned
    expect(global.fetch).toHaveBeenCalledWith('/api/backend/intents/reservations/prepare', expect.any(Object));
    expect(global.fetch).toHaveBeenCalledWith('/api/backend/intents/reservations/finalize', expect.any(Object));
    expect(bookingMocks.updateBooking).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      reservationKey: expect.any(String),
      labId: vars.tokenId,
      status: 'requested',
    }));

    // Optimistic booking UI state should be set for the reservation
    expect(mockSetOptimisticBookingState).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ status: 'requested' }));

    expect(out).toEqual(expect.objectContaining({ intent: expect.any(Object), requestId: expect.any(String) }));
  });

  test('SSO: prepare failure -> throw and do not call addBooking', async () => {
    const bookingMocks = makeBookingMocks();
    mockBookingCacheFactory.mockImplementation(() => bookingMocks);

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'boom' }),
    });

    const { result } = renderHook(() => useReservationRequestSSO(), { wrapper: createWrapper() });

    const vars = { tokenId: 'tkX', start: 1, end: 2 };

    await act(async () => {
      await expect(result.current.mutateAsync(vars)).rejects.toThrow('boom');
    });

    expect(bookingMocks.updateBooking).not.toHaveBeenCalled();
  });

  test('SSO: finalize timeout bubbles error and skips cache update', async () => {
    const bookingMocks = makeBookingMocks();
    mockBookingCacheFactory.mockImplementation(() => bookingMocks);

    const preparePayload = {
      ok: true,
      json: () => Promise.resolve({
        webauthnChallenge: 'challenge',
        allowCredentials: [],
        intent: { meta: { requestId: 'req-timeout' }, payload: { reservationKey: 'rk-timeout' } },
        adminSignature: '0xadmin',
        webauthnCredentialId: 'cred',
      }),
    };

    const timeoutError = Object.assign(new Error('timeout'), { name: 'TimeoutError' });

    global.fetch = jest.fn()
      .mockResolvedValueOnce(preparePayload)
      .mockRejectedValueOnce(timeoutError);

    const { result } = renderHook(() => useReservationRequestSSO(), { wrapper: createWrapper() });

    await act(async () => {
      await expect(result.current.mutateAsync({ tokenId: 'tkZ', start: 1, end: 2 })).rejects.toThrow('timeout');
    });

    expect(bookingMocks.updateBooking).not.toHaveBeenCalled();
  });

  test('SSO: no PublicKeyCredential -> reject without touching cache', async () => {
    const bookingMocks = makeBookingMocks();
    mockBookingCacheFactory.mockImplementation(() => bookingMocks);

    const originalPKC = global.window.PublicKeyCredential;
    global.window.PublicKeyCredential = undefined;
    globalThis.window = global.window;
    global.fetch = jest.fn();

    const { result } = renderHook(() => useReservationRequestSSO(), { wrapper: createWrapper() });

    await act(async () => {
      await expect(result.current.mutateAsync({ tokenId: 'tk-no-webauthn', start: 1, end: 2 }))
        .rejects.toThrow('WebAuthn not supported');
    });

    expect(bookingMocks.updateBooking).not.toHaveBeenCalled();

    global.window.PublicKeyCredential = originalPKC;
  });

  test('SSO: navigator.credentials.get throws -> no finalize, no cache update', async () => {
    const bookingMocks = makeBookingMocks();
    mockBookingCacheFactory.mockImplementation(() => bookingMocks);

    global.navigator.credentials.get = jest.fn(() => Promise.reject(new Error('cred boom')));

    const preparePayload = {
      ok: true,
      json: () => Promise.resolve({
        webauthnChallenge: 'challenge',
        allowCredentials: [],
        intent: { meta: { requestId: 'req-cred' }, payload: { reservationKey: 'rk-cred' } },
        adminSignature: '0xadmin',
        webauthnCredentialId: 'cred',
      }),
    };

    global.fetch = jest.fn().mockResolvedValueOnce(preparePayload);

    const { result } = renderHook(() => useReservationRequestSSO(), { wrapper: createWrapper() });

    await act(async () => {
      await expect(result.current.mutateAsync({ tokenId: 'tk-cred', start: 1, end: 2 }))
        .rejects.toThrow('cred boom');
    });

    expect(global.fetch).toHaveBeenCalledTimes(1); // finalize not called
    expect(bookingMocks.updateBooking).not.toHaveBeenCalled();
  });

  test('SSO: finalize non-ok -> throws and skips cache update', async () => {
    const bookingMocks = makeBookingMocks();
    mockBookingCacheFactory.mockImplementation(() => bookingMocks);

    const preparePayload = {
      ok: true,
      json: () => Promise.resolve({
        webauthnChallenge: 'challenge',
        allowCredentials: [],
        intent: { meta: { requestId: 'req-finalize-bad' }, payload: { reservationKey: 'rk-finalize-bad' } },
        adminSignature: '0xadmin',
        webauthnCredentialId: 'cred',
      }),
    };

    const finalizePayload = {
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'finalize-fail' }),
    };

    global.fetch = jest.fn()
      .mockResolvedValueOnce(preparePayload)
      .mockResolvedValueOnce(finalizePayload);

    const { result } = renderHook(() => useReservationRequestSSO(), { wrapper: createWrapper() });

    await act(async () => {
      await expect(result.current.mutateAsync({ tokenId: 'tk-finalize', start: 1, end: 2 }))
        .rejects.toThrow('finalize-fail');
    });

    expect(bookingMocks.updateBooking).not.toHaveBeenCalled();
  });
});

