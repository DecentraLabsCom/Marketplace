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
jest.mock('@/utils/intents/verifyOnchainIntentStatus', () => ({
  verifyInstitutionReportedExecution: jest.fn(() => Promise.resolve({ state: 2, stateName: 'EXECUTED' })),
}));

import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import pollIntentStatus from '@/utils/intents/pollIntentStatus';
import { bookingQueryKeys } from '@/utils/hooks/queryKeys';
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

  test('aborts intent polling when the hook unmounts', async () => {
    let resolvePoll;
    pollIntentStatus.mockImplementationOnce(
      () => new Promise((resolve) => { resolvePoll = resolve; }),
    );
    const updateBooking = jest.fn();
    const invalidateAllBookings = jest.fn();
    mockBookingCacheFactory.mockImplementation(() => ({ updateBooking, invalidateAllBookings }));

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          authorizationUrl: 'https://institution.example/intents/authorize/session-abort',
          authorizationSessionId: 'session-abort',
          backendUrl: 'https://institution.example',
          intent: { meta: { requestId: 'req-abort' }, payload: {} },
        }),
    });

    const { wrapper } = createWrapper();
    const { result, unmount } = renderHook(() => useCancelReservationRequestSSO(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('rk-abort-1');
    });

    const [, pollOptions] = pollIntentStatus.mock.calls[0];
    expect(pollOptions.signal.aborted).toBe(false);

    unmount();
    expect(pollOptions.signal.aborted).toBe(true);

    resolvePoll({ status: 'executed' });
    await act(async () => {
      await Promise.resolve();
    });

    expect(invalidateAllBookings).not.toHaveBeenCalled();
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

  test('uses the input labId when the reservation detail is not cached', async () => {
    const updateBooking = jest.fn();
    const invalidateAllBookings = jest.fn();
    mockBookingCacheFactory.mockImplementation(() => ({ updateBooking, invalidateAllBookings }));

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        authorizationUrl: 'https://institution.example/intents/authorize/session-fallback',
        authorizationSessionId: 'session-fallback',
        backendUrl: 'https://institution.example',
        intent: { meta: { requestId: 'req-fallback' }, payload: {} },
      }),
    });

    const { qc, wrapper } = createWrapper();
    const availabilityKey = bookingQueryKeys.checkAvailable('11', 100, 60);
    const labReservationsKey = bookingQueryKeys.getReservationsOfToken('11');
    qc.setQueryData(availabilityKey, { isAvailable: true });
    qc.setQueryData(labReservationsKey, { count: 1 });

    const { result } = renderHook(() => useCancelReservationRequest(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ reservationKey: 'rk-fallback', labId: 11 });
    });

    await waitFor(() => {
      expect(qc.getQueryState(availabilityKey)?.isInvalidated).toBe(true);
      expect(qc.getQueryState(labReservationsKey)?.isInvalidated).toBe(true);
    });
  });

  test('invalidates the full booking scope when confirmed cancellation polling fails', async () => {
    const invalidateAllBookings = jest.fn();
    mockBookingCacheFactory.mockImplementation(() => ({ invalidateAllBookings }));
    pollIntentStatus.mockRejectedValueOnce(new Error('temporary polling failure'));

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        authorizationUrl: 'https://institution.example/intents/authorize/session-error',
        authorizationSessionId: 'session-error',
        backendUrl: 'https://institution.example',
        intent: { meta: { requestId: 'req-error' }, payload: {} },
      }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCancelBooking(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ reservationKey: 'rk-error', labId: 12 });
    });

    await waitFor(() => {
      expect(invalidateAllBookings).toHaveBeenCalledTimes(1);
    });
  });
});
