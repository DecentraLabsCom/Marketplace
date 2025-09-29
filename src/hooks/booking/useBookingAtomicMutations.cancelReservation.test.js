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
  require('../../test-utils/mocks/hooks/useContractWriteFunction')
);
jest.mock('./useBookingCacheUpdates', () =>
  require('../../test-utils/mocks/hooks/useBookingCacheUpdates')
);

import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useCancelReservationRequestSSO,
  useCancelReservationRequestWallet,
} from './useBookingAtomicMutations';

// Centralized mock factories (match your test-utils)
const mockContractWriteFactory = require('../../test-utils/mocks/hooks/useContractWriteFunction');
const { useBookingCacheUpdates: mockBookingCacheFactory } = require('../../test-utils/mocks/hooks/useBookingCacheUpdates');

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
  });

  afterEach(() => {
    // Clean up any global.fetch mocks between tests
    if (global.fetch && global.fetch.mockRestore) global.fetch.mockRestore();
    delete global.fetch;
    jest.clearAllMocks();
  });

  test('SSO: POST to backend and updateBooking called', async () => {
    // Arrange: mock booking cache utilities used by the hook
    const updateBooking = jest.fn();
    const invalidateAllBookings = jest.fn();
    mockBookingCacheFactory.mockImplementation(() => ({ updateBooking, invalidateAllBookings }));

    // Simulate successful backend response
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) })
    );

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCancelReservationRequestSSO(), { wrapper });

    // Act: call mutation with reservation key
    await act(async () => {
      await result.current.mutateAsync('rk-csso-1');
    });

    // Assert: correct endpoint called and cache update invoked
    expect(global.fetch).toHaveBeenCalledWith('/api/contract/reservation/cancelReservationRequest', expect.objectContaining({
      method: 'POST',
    }));
    expect(updateBooking).toHaveBeenCalledWith('rk-csso-1', expect.objectContaining({
      status: '4',
      isCancelled: true,
    }));
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
