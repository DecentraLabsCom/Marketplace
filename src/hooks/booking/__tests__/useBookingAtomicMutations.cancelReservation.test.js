/**
 * Unit tests for institutional cancellation mutations.
 */

jest.mock('../useBookingCacheUpdates', () => ({
  useBookingCacheUpdates: jest.fn(),
}));
jest.mock('@/context/UserContext', () => ({
  useUser: jest.fn(() => ({
    institutionBackendUrl: 'https://institution.example',
  })),
}));
jest.mock('@/utils/intents/pollIntentStatus', () => jest.fn(() => Promise.resolve({ status: 'executed' })));
jest.mock('@/utils/intents/pollIntentAuthorizationStatus', () => jest.fn(() => Promise.resolve({ status: 'SUCCESS', requestId: 'req-1' })));

import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useCancelReservationRequest,
  useCancelReservationRequestSSO,
  useCancelBooking,
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

const { useBookingCacheUpdates: mockBookingCacheFactory } = require('../useBookingCacheUpdates');

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, wrapper };
}

describe('institutional cancellation mutations', () => {
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
  });

  test('useCancelReservationRequestSSO prepares intent and marks cancellation state', async () => {
    const updateBooking = jest.fn();
    const invalidateAllBookings = jest.fn();
    mockBookingCacheFactory.mockImplementation(() => ({ updateBooking, invalidateAllBookings }));

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          authorizationUrl: 'https://institution.example/intents/authorize/session-1',
          authorizationSessionId: 'session-1',
          backendUrl: 'https://institution.example',
          intent: { meta: { requestId: 'req-1' }, payload: {} },
        }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCancelReservationRequestSSO(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('rk-csso-1');
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/backend/intents/actions/prepare', expect.any(Object));
    expect(updateBooking).toHaveBeenCalled();
    expect(mockSetOptimisticBookingState).toHaveBeenCalledWith('rk-csso-1', expect.objectContaining({ status: 'cancel-requested' }));
    expect(mockCompleteOptimisticBookingState).toHaveBeenCalledWith('rk-csso-1');
  });

  test('useCancelReservationRequest delegates to the institutional path', async () => {
    const updateBooking = jest.fn();
    const invalidateAllBookings = jest.fn();
    mockBookingCacheFactory.mockImplementation(() => ({ updateBooking, invalidateAllBookings }));

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          authorizationUrl: 'https://institution.example/intents/authorize/session-2',
          authorizationSessionId: 'session-2',
          backendUrl: 'https://institution.example',
          intent: { meta: { requestId: 'req-2' }, payload: {} },
        }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCancelReservationRequest(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ reservationKey: 'rk-cancel-2', labId: '11' });
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(updateBooking).toHaveBeenCalledWith('rk-cancel-2', expect.objectContaining({ status: 'cancel-requested' }));
  });

  test('useCancelBooking delegates to the institutional path', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          authorizationUrl: 'https://institution.example/intents/authorize/session-3',
          authorizationSessionId: 'session-3',
          backendUrl: 'https://institution.example',
          intent: { meta: { requestId: 'req-3' }, payload: {} },
        }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCancelBooking(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ reservationKey: 'rk-booking-3', labId: '12' });
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/backend/intents/actions/prepare', expect.any(Object));
    expect(mockSetOptimisticBookingState).toHaveBeenCalledWith('rk-booking-3', expect.objectContaining({ status: 'cancel-requested' }));
  });
});
