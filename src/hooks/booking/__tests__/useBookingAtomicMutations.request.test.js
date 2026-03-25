/**
 * Unit tests for institutional reservation request mutations.
 */

jest.mock('../useBookingCacheUpdates', () => ({
  useBookingCacheUpdates: jest.fn(),
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

import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import pollIntentStatus from '@/utils/intents/pollIntentStatus';
import pollIntentAuthorizationStatus from '@/utils/intents/pollIntentAuthorizationStatus';
import {
  useReservationRequest,
  useReservationRequestSSO,
} from '../useBookingAtomicMutations';

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

jest.mock('@/utils/intents/pollIntentStatus', () => jest.fn(() => Promise.resolve({ status: 'processing' })));
jest.mock('@/utils/intents/pollIntentAuthorizationStatus', () => jest.fn(() => Promise.resolve({ status: 'SUCCESS' })));

const { useBookingCacheUpdates: mockBookingCacheFactory } = require('../useBookingCacheUpdates');

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const makeBookingMocks = (overrides = {}) => ({
  addBooking: jest.fn(),
  updateBooking: jest.fn(),
  invalidateAllBookings: jest.fn(),
  removeOptimisticBooking: jest.fn(),
  replaceOptimisticBooking: jest.fn(),
  ...overrides,
});

describe('institutional reservation request mutations', () => {
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
    if (global.fetch && global.fetch.mockRestore) global.fetch.mockRestore();
    delete global.fetch;
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  test('useReservationRequestSSO prepares intent and marks optimistic state', async () => {
    const bookingMocks = makeBookingMocks();
    mockBookingCacheFactory.mockImplementation(() => bookingMocks);
    pollIntentAuthorizationStatus.mockResolvedValueOnce({ status: 'SUCCESS', requestId: 'req-1' });

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          authorizationUrl: 'https://institution.example/intents/authorize/session-1',
          authorizationSessionId: 'session-1',
          backendUrl: 'https://institution.example',
          intent: {
            meta: { requestId: 'req-1' },
            payload: { reservationKey: 'rk-1' },
          },
        }),
    });

    const { result } = renderHook(() => useReservationRequestSSO(), { wrapper: createWrapper() });

    let out;
    await act(async () => {
      out = await result.current.mutateAsync({ tokenId: 'tk1', start: 111, end: 222, userAddress: 'u1' });
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/backend/intents/reservations/prepare', expect.any(Object));
    expect(bookingMocks.updateBooking).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      labId: 'tk1',
      status: 'requested',
    }));
    expect(mockSetOptimisticBookingState).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ status: 'requested' }));
    expect(out).toEqual(expect.objectContaining({ requestId: 'req-1' }));
  });

  test('intent execution updates the final reservation key', async () => {
    const bookingMocks = makeBookingMocks();
    mockBookingCacheFactory.mockImplementation(() => bookingMocks);
    pollIntentAuthorizationStatus.mockResolvedValueOnce({ status: 'SUCCESS', requestId: 'req-int-1' });
    pollIntentStatus.mockResolvedValueOnce({
      status: 'executed',
      txHash: '0xEXEC',
      reservationKey: 'rk-final',
    });

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          authorizationUrl: 'https://institution.example/intents/authorize/session-int',
          authorizationSessionId: 'session-int',
          backendUrl: 'https://institution.example',
          intent: {
            meta: { requestId: 'req-int-1' },
            payload: { reservationKey: 'rk-int-1' },
          },
        }),
    });

    const { result } = renderHook(() => useReservationRequest(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ tokenId: 'tk-int', start: 111, end: 222, userAddress: '0xint' });
    });

    await waitFor(() => {
      expect(pollIntentStatus).toHaveBeenCalled();
      expect(bookingMocks.updateBooking).toHaveBeenCalledWith(
        'rk-final',
        expect.objectContaining({
          reservationKey: 'rk-final',
          intentStatus: 'executed',
          status: 'pending',
          transactionHash: '0xEXEC',
        })
      );
    });
  });

  test('prepare failure throws and does not update cache', async () => {
    const bookingMocks = makeBookingMocks();
    mockBookingCacheFactory.mockImplementation(() => bookingMocks);

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'prepare failed' }),
      status: 500,
    });

    const { result } = renderHook(() => useReservationRequestSSO(), { wrapper: createWrapper() });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ tokenId: 'tk-fail', start: 1, end: 2, userAddress: '0xfail' })
      ).rejects.toThrow();
    });

    expect(bookingMocks.addBooking).not.toHaveBeenCalled();
    expect(bookingMocks.updateBooking).not.toHaveBeenCalled();
    expect(mockSetOptimisticBookingState).not.toHaveBeenCalled();
  });
});
