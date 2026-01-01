/**
 * cancelReservation hooks — unit tests
 *
 * Purpose:
 *  - Validate core behavior for cancelReservationRequest hooks:
 *    * SSO: POST to backend endpoint and call updateBooking on success.
 *    * Wallet: invoke contract write and attempt a local cache update via QueryClient.
 *
 * Notes:
 *  - External dependencies are mocked using centralized factories under src/test-utils/mocks/hooks.
 *  - Tests run with a QueryClientProvider configured with retries disabled for deterministic behavior.
 *  - global.fetch is restored between tests to avoid leakage.
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
jest.mock('@/utils/intents/pollIntentStatus', () => jest.fn(() => Promise.resolve({ status: 'executed' })));

import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useCancelReservationRequestSSO,
  useCancelReservationRequestWallet,
} from '../useBookingAtomicMutations';

// Centralized mock factories (match your test-utils)
const mockContractWriteFactory = require('../../../test-utils/mocks/hooks/useContractWriteFunction');
const { useBookingCacheUpdates: mockBookingCacheFactory } = require('../../../test-utils/mocks/hooks/useBookingCacheUpdates');

/* Shared QueryClient wrapper used across tests */
function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, wrapper };
}

describe('cancelReservation hooks (minimal unit tests)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete global.fetch;
    global.window = { PublicKeyCredential: true };
    global.navigator = {
      credentials: { get: jest.fn(() => Promise.resolve({})) },
    };
  });

  afterEach(() => {
    // Clean up any global.fetch mocks between tests
    if (global.fetch && global.fetch.mockRestore) global.fetch.mockRestore();
    delete global.fetch;
    jest.clearAllMocks();
    delete global.window;
    delete global.navigator;
  });

  test('SSO: intent prepare/finalize and updateBooking called', async () => {
    // Arrange: mock booking cache utilities used by the hook
    const updateBooking = jest.fn();
    const invalidateAllBookings = jest.fn();
    mockBookingCacheFactory.mockImplementation(() => ({ updateBooking, invalidateAllBookings }));

    // Simulate prepare/finalize flow
    const preparePayload = {
      ok: true,
      json: () =>
        Promise.resolve({
          webauthnChallenge: 'challenge',
          allowCredentials: [],
          intent: { meta: { requestId: 'req-1' }, payload: {} },
          adminSignature: '0xadmin',
          webauthnCredentialId: 'cred',
        }),
    };
    const finalizePayload = {
      ok: true,
      json: () =>
        Promise.resolve({
          intent: { meta: { requestId: 'req-1' } },
          status: 'executed',
        }),
    };
    global.fetch = jest.fn()
      // prepare
      .mockResolvedValueOnce(preparePayload)
      // finalize
      .mockResolvedValueOnce(finalizePayload);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCancelReservationRequestSSO(), { wrapper });

    // Act: call mutation with reservation key
    await act(async () => {
      await result.current.mutateAsync('rk-csso-1');
    });

    // Assert: prepare + finalize called and cache update invoked
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenCalledWith('/api/backend/intents/actions/prepare', expect.any(Object));
    expect(global.fetch).toHaveBeenCalledWith('/api/backend/intents/actions/finalize', expect.any(Object));
    expect(updateBooking).toHaveBeenCalled();
  });

  test('Wallet: contract write called and QueryClient.setQueryData attempted', async () => {
    // Arrange: prepare QueryClient and spy setQueryData
    const { qc, wrapper } = createWrapper();
    const setSpy = jest.spyOn(qc, 'setQueryData');

    // Mock contract write to resolve with a tx hash
    const cancelFn = jest.fn(() => Promise.resolve('0xCXL'));
    mockContractWriteFactory.mockImplementation(() => ({ contractWriteFunction: cancelFn }));

    const { result } = renderHook(() => useCancelReservationRequestWallet(), { wrapper });

    // Act: perform the wallet cancellation
    await act(async () => {
      await result.current.mutateAsync('rk-wallet-1');
    });

    // Assert: contract function invoked with reservation key and local cache attempted to be patched
    expect(cancelFn).toHaveBeenCalledWith(['rk-wallet-1']);
    expect(setSpy).toHaveBeenCalled();

    setSpy.mockRestore();
  });
});

