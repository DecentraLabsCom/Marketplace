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
jest.mock('@/context/UserContext', () => ({
  useUser: jest.fn(() => ({ isSSO: true })),
}));

import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useReservationRequest } from '../useBookingAtomicMutations';

const mockContractWriteFactory = require('../../../test-utils/mocks/hooks/useContractWriteFunction');
const { useBookingCacheUpdates: mockBookingCacheFactory } = require('../../../test-utils/mocks/hooks/useBookingCacheUpdates');

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
    global.window = { PublicKeyCredential: true };
    global.navigator = { credentials: { get: jest.fn(() => Promise.resolve({})) } };
  });

  afterEach(() => {
    // ensure fetch cleaned up between tests
    if (global.fetch && global.fetch.mockRestore) global.fetch.mockRestore();
    delete global.fetch;
    jest.clearAllMocks();
    delete global.window;
    delete global.navigator;
  });

  test('SSO path: uses fetch and calls addBooking', async () => {
    setUserSSO(true);

    const updateBooking = jest.fn();
    const invalidateAllBookings = jest.fn();
    mockBookingCacheFactory.mockImplementation(() => ({ updateBooking, invalidateAllBookings }));

    const preparePayload = {
      ok: true,
      json: () =>
        Promise.resolve({
          webauthnChallenge: 'Y2hhbGxlbmdl', // base64 encoded 'challenge'
          allowCredentials: [],
          intent: {
            meta: { requestId: 'req-u-1' },
            payload: { reservationKey: 'rk-u-1' },
          },
          adminSignature: '0xadmin',
          webauthnCredentialId: 'Y3JlZA', // base64 encoded
        }),
    };
    const finalizePayload = {
      ok: true,
      json: () =>
        Promise.resolve({
          intent: { meta: { requestId: 'req-u-1' }, payload: { reservationKey: 'rk-u-1' } },
          status: 'dispatched',
        }),
    };
    global.fetch = jest.fn()
      .mockResolvedValueOnce(preparePayload)
      .mockResolvedValueOnce(finalizePayload);

    const { result } = renderHook(() => useReservationRequest(), { wrapper: createWrapper() });

    const vars = { tokenId: 'tU1', start: 10, end: 20, userAddress: 'u1' };

    let out;
    await act(async () => { out = await result.current.mutateAsync(vars); });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(updateBooking).toHaveBeenCalledTimes(1);
    expect(out).toEqual(expect.objectContaining({ intent: expect.any(Object) }));
  });

  test('SSO path: does not call wallet contract writer', async () => {
    setUserSSO(true);

    const updateBooking = jest.fn();
    const invalidateAllBookings = jest.fn();
    mockBookingCacheFactory.mockImplementation(() => ({ updateBooking, invalidateAllBookings }));

    const contractWriteFn = jest.fn();
    mockContractWriteFactory.mockImplementation(() => ({ contractWriteFunction: contractWriteFn }));

    const preparePayload = {
      ok: true,
      json: () => Promise.resolve({
        webauthnChallenge: 'Y2hhbGxlbmdl',
        allowCredentials: [],
        intent: { meta: { requestId: 'req-ssopath' }, payload: { reservationKey: 'rk-ssopath' } },
        adminSignature: '0xadmin',
        webauthnCredentialId: 'cred',
      }),
    };
    const finalizePayload = {
      ok: true,
      json: () => Promise.resolve({
        intent: { meta: { requestId: 'req-ssopath' }, payload: { reservationKey: 'rk-ssopath' } },
        status: 'dispatched',
      }),
    };
    global.fetch = jest.fn()
      .mockResolvedValueOnce(preparePayload)
      .mockResolvedValueOnce(finalizePayload);

    const { result } = renderHook(() => useReservationRequest(), { wrapper: createWrapper() });

    await act(async () => { await result.current.mutateAsync({ tokenId: 'tk-sso', start: 1, end: 2 }); });

    expect(contractWriteFn).not.toHaveBeenCalled();
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

  test('Wallet path: does not call fetch (SSO API)', async () => {
    setUserSSO(false);

    const addOptimisticBooking = jest.fn(() => ({ id: 'opt-nofetch' }));
    const replaceOptimisticBooking = jest.fn();
    const removeOptimisticBooking = jest.fn();
    const invalidateAllBookings = jest.fn();

    mockBookingCacheFactory.mockImplementation(() => ({
      addOptimisticBooking,
      replaceOptimisticBooking,
      removeOptimisticBooking,
      invalidateAllBookings,
    }));

    const contractWriteFn = jest.fn(() => Promise.resolve('0xHASH')); 
    mockContractWriteFactory.mockImplementation(() => ({ contractWriteFunction: contractWriteFn }));

    global.fetch = jest.fn();

    const { result } = renderHook(() => useReservationRequest(), { wrapper: createWrapper() });

    await act(async () => { await result.current.mutateAsync({ tokenId: 'tk-wallet', start: 3, end: 4, userAddress: '0xAA' }); });

    expect(global.fetch).not.toHaveBeenCalled();
  });
});
