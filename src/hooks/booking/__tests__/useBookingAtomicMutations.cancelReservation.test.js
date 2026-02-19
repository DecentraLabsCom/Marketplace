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
jest.mock('@/context/UserContext', () => ({
  useUser: jest.fn(() => ({
    isSSO: true,
    institutionBackendUrl: 'https://institution.example',
  })),
}));
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
jest.mock('@/utils/intents/pollIntentAuthorizationStatus', () => jest.fn(() => Promise.resolve({ status: 'SUCCESS', requestId: 'req-1' })));

import { renderHook, act } from '@testing-library/react';

// Mock optimistic UI helpers
const mockSetOptimisticBookingState = jest.fn();
const mockCompleteOptimisticBookingState = jest.fn();

jest.mock('@/context/OptimisticUIContext', () => ({
  useOptimisticUI: () => ({
    setOptimisticBookingState: mockSetOptimisticBookingState,
    completeOptimisticBookingState: mockCompleteOptimisticBookingState,
  }),
}));
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useCancelReservationRequestSSO,
  useCancelReservationRequestWallet,
  useCancelBookingWallet,
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
    global.window.PublicKeyCredential = function PublicKeyCredential() {};
    global.window.open = jest.fn(() => ({
      closed: false,
      focus: jest.fn(),
      close: jest.fn(),
      opener: null,
    }));
    global.navigator.credentials = { get: jest.fn(() => Promise.resolve({})) };
  });

  afterEach(() => {
    // Clean up any global.fetch mocks between tests
    if (global.fetch && global.fetch.mockRestore) global.fetch.mockRestore();
    delete global.fetch;
    jest.clearAllMocks();
  });

  test('SSO: intent prepare + popup authorization and updateBooking called', async () => {
    // Arrange: mock booking cache utilities used by the hook
    const updateBooking = jest.fn();
    const invalidateAllBookings = jest.fn();
    mockBookingCacheFactory.mockImplementation(() => ({ updateBooking, invalidateAllBookings }));

    // Simulate prepare + popup authorization flow
    const preparePayload = {
      ok: true,
      json: () =>
        Promise.resolve({
          authorizationUrl: 'https://institution.example/intents/authorize/session-1',
          authorizationSessionId: 'session-1',
          backendUrl: 'https://institution.example',
          intent: { meta: { requestId: 'req-1' }, payload: {} },
        }),
    };
    global.fetch = jest.fn().mockResolvedValueOnce(preparePayload);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCancelReservationRequestSSO(), { wrapper });

    // Act: call mutation with reservation key
    await act(async () => {
      await result.current.mutateAsync('rk-csso-1');
    });

    // Assert: prepare called and cache update invoked
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith('/api/backend/intents/actions/prepare', expect.any(Object));
    expect(updateBooking).toHaveBeenCalled();

    // Optimistic booking UI state should be set and then completed after executed status
    expect(mockSetOptimisticBookingState).toHaveBeenCalledWith('rk-csso-1', expect.objectContaining({ status: 'cancel-requested' }));
    expect(mockCompleteOptimisticBookingState).toHaveBeenCalledWith('rk-csso-1');
  });

  test('Wallet: contract write called and cancellation waits for event-driven cache updates', async () => {
    // Arrange
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

    // Assert: contract function invoked with reservation key
    expect(cancelFn).toHaveBeenCalledWith(['rk-wallet-1']);
    // No status=cancelled optimistic cache patch here; UI waits for blockchain event.
    expect(setSpy).not.toHaveBeenCalled();

    // Optimistic UI should be set and completed for the cancellation
    expect(mockSetOptimisticBookingState).toHaveBeenCalledWith('rk-wallet-1', expect.objectContaining({ status: 'cancelling' }));
    expect(mockCompleteOptimisticBookingState).toHaveBeenCalledWith('rk-wallet-1');

    setSpy.mockRestore();
  });

  test('Wallet cancelReservationRequest: accepts booking object input and uses reservationKey', async () => {
    const { wrapper } = createWrapper();
    const cancelFn = jest.fn(() => Promise.resolve('0xOBJ1'));
    mockContractWriteFactory.mockImplementation(() => ({ contractWriteFunction: cancelFn }));

    const { result } = renderHook(() => useCancelReservationRequestWallet(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ reservationKey: 'rk-wallet-obj-1', labId: '11' });
    });

    expect(cancelFn).toHaveBeenCalledWith(['rk-wallet-obj-1']);
    expect(mockSetOptimisticBookingState).toHaveBeenCalledWith(
      'rk-wallet-obj-1',
      expect.objectContaining({ status: 'cancelling' })
    );
    expect(mockCompleteOptimisticBookingState).toHaveBeenCalledWith('rk-wallet-obj-1');
  });

  test('Wallet cancelBooking: accepts booking object input and uses reservationKey', async () => {
    const { wrapper } = createWrapper();
    const cancelFn = jest.fn(() => Promise.resolve('0xOBJ2'));
    mockContractWriteFactory.mockImplementation(() => ({ contractWriteFunction: cancelFn }));

    const { result } = renderHook(() => useCancelBookingWallet(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ reservationKey: 'rk-wallet-obj-2', labId: '12' });
    });

    expect(cancelFn).toHaveBeenCalledWith(['rk-wallet-obj-2']);
    expect(mockSetOptimisticBookingState).toHaveBeenCalledWith(
      'rk-wallet-obj-2',
      expect.objectContaining({ status: 'cancelling' })
    );
    expect(mockCompleteOptimisticBookingState).toHaveBeenCalledWith('rk-wallet-obj-2');
  });
});

