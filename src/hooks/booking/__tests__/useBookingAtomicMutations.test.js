/**
 * Tests for useBookingAtomicMutations.js helpers
 * Prioridad: helpers simples y puros
 */

import {
  resolveBookingContext,
  normalizeReservationMutationInput,
  resolveReservationSnapshotFromCache,
  invalidateInstitutionalReservationQueries,
  emitReservationProgress,
  normalizeRequestFundsInput
} from '../useBookingAtomicMutations';

// Mocks
const mockQueryClient = {
  getQueryData: jest.fn(() => ({ reservation: { labId: 1, renter: '0x123', price: '100' } })),
  invalidateQueries: jest.fn()
};

describe('Helpers - useBookingAtomicMutations', () => {
  describe('resolveBookingContext', () => {
    test('returns labId and userAddress from cache', () => {
      const ctx = resolveBookingContext(mockQueryClient, 'key');
      expect(ctx.labId).toBe(1);
      expect(ctx.userAddress).toBe('0x123');
    });
    test('returns empty object if no queryClient or reservationKey', () => {
      expect(resolveBookingContext(null, 'key')).toEqual({});
      expect(resolveBookingContext(mockQueryClient, null)).toEqual({});
    });
  });

  describe('normalizeReservationMutationInput', () => {
    test('normalizes string input', () => {
      expect(normalizeReservationMutationInput('key')).toEqual({ reservationKey: 'key' });
    });
    test('normalizes object input', () => {
      expect(normalizeReservationMutationInput({ reservationKey: 'key', labId: 2, price: '200' })).toEqual({ reservationKey: 'key', labId: 2, price: '200' });
    });
    test('returns null reservationKey for invalid input', () => {
      expect(normalizeReservationMutationInput(undefined)).toEqual({ reservationKey: null });
      expect(normalizeReservationMutationInput(123)).toEqual({ reservationKey: null });
    });
  });

  describe('resolveReservationSnapshotFromCache', () => {
    test('returns snapshot from cache', () => {
      const snap = resolveReservationSnapshotFromCache(mockQueryClient, 'key');
      expect(snap.labId).toBe(1);
      expect(snap.price).toBe('100');
      expect(snap.userAddress).toBe('0x123');
    });
    test('returns empty object if no queryClient or reservationKey', () => {
      expect(resolveReservationSnapshotFromCache(null, 'key')).toEqual({});
      expect(resolveReservationSnapshotFromCache(mockQueryClient, null)).toEqual({});
    });
  });

  describe('invalidateInstitutionalReservationQueries', () => {
    test('calls invalidateQueries for all keys', () => {
      invalidateInstitutionalReservationQueries(mockQueryClient, { labId: 1, reservationKey: 'key' });
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalled();
    });
    test('does nothing if no queryClient', () => {
      expect(() => invalidateInstitutionalReservationQueries(null, { labId: 1, reservationKey: 'key' })).not.toThrow();
    });
  });

  describe('emitReservationProgress', () => {
    test('calls onProgress callback', () => {
      const cb = jest.fn();
      emitReservationProgress({ onProgress: cb }, 'stage', { foo: 1 });
      expect(cb).toHaveBeenCalledWith({ stage: 'stage', foo: 1 });
    });
    test('does nothing if no callback', () => {
      expect(() => emitReservationProgress({}, 'stage')).not.toThrow();
    });
  });

  describe('normalizeRequestFundsInput', () => {
    test('normalizes valid input', () => {
      const input = { labId: 5, maxBatch: 10, backendUrl: 'url' };
      expect(normalizeRequestFundsInput(input)).toEqual({ labId: 5, maxBatch: 10, backendUrl: 'url' });
    });
    test('throws error for invalid labId', () => {
      expect(() => normalizeRequestFundsInput({ labId: 'bad' })).toThrow();
      expect(() => normalizeRequestFundsInput({})).toThrow();
    });
    test('throws error for invalid maxBatch', () => {
      expect(() => normalizeRequestFundsInput({ labId: 1, maxBatch: 0 })).toThrow();
      expect(() => normalizeRequestFundsInput({ labId: 1, maxBatch: 101 })).toThrow();
    });
  });
});

import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useReservationRequestSSO, useReservationRequestWallet, useReservationRequest,
  useCancelReservationRequestSSO, useCancelReservationRequestWallet, useCancelReservationRequest,
  useCancelBookingSSO, useCancelBookingWallet, useCancelBooking,
  useRequestFundsSSO, useRequestFundsWallet, useRequestFunds
} from '../useBookingAtomicMutations';
import { useGetIsSSO } from '@/utils/hooks/authMode';

jest.mock('@/utils/hooks/authMode', () => ({
  useGetIsSSO: jest.fn(() => false),
}));

jest.mock('@/context/UserContext', () => ({
  useUser: jest.fn(() => ({ institutionBackendUrl: 'https://backend.example' })),
}));

jest.mock('../useBookingCacheUpdates', () => ({
  __esModule: true,
  default: () => ({
    addOptimisticBooking: jest.fn((data) => ({ ...data, id: 'optimisticId' })),
    replaceOptimisticBooking: jest.fn(),
    removeOptimisticBooking: jest.fn(),
    invalidateAllBookings: jest.fn(),
    updateBooking: jest.fn(),
    addBooking: jest.fn(),
  }),
  useBookingCacheUpdates: () => ({
    addOptimisticBooking: jest.fn((data) => ({ ...data, id: 'optimisticId' })),
    replaceOptimisticBooking: jest.fn(),
    removeOptimisticBooking: jest.fn(),
    invalidateAllBookings: jest.fn(),
    updateBooking: jest.fn(),
    addBooking: jest.fn(),
  })
}));

jest.mock('@/hooks/contract/useContractWriteFunction', () => ({
  __esModule: true,
  default: jest.fn(() => ({ contractWriteFunction: jest.fn(() => Promise.resolve('txHash')) }))
}));

jest.mock('@/context/OptimisticUIContext', () => ({
  __esModule: true,
  default: () => ({
    setOptimisticBookingState: jest.fn(),
    completeOptimisticBookingState: jest.fn(),
    clearOptimisticBookingState: jest.fn(),
  }),
  useOptimisticUI: () => ({
    setOptimisticBookingState: jest.fn(),
    completeOptimisticBookingState: jest.fn(),
    clearOptimisticBookingState: jest.fn(),
  })
}));

jest.mock('@/utils/dev/logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    moduleLoaded: jest.fn(),
  },
}));

jest.mock('../utils/createPendingBookingPayload', () => ({
  __esModule: true,
  default: jest.fn((data) => ({ ...data, pending: true }))
}));

jest.mock('@/utils/intents/pollIntentStatus', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('@/utils/intents/authorizationOrchestrator', () => ({
  awaitIntentAuthorization: jest.fn(),
  resolveAuthorizationStatusBaseUrl: jest.fn(),
}));

const createWrapper = (queryClient) => ({ children }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('Wallet Hooks Coverage', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('useReservationRequestWallet executes transaction and returns hash', async () => {
    const { result } = renderHook(() => useReservationRequestWallet(), { wrapper: createWrapper(queryClient) });
    let data;
    await act(async () => {
      data = await result.current.mutateAsync({ tokenId: 1, start: 100, end: 200, userAddress: '0x123' });
    });
    expect(data.hash).toBe('txHash');
  });

  test('useCancelReservationRequestWallet executes transaction and returns hash', async () => {
    const { result } = renderHook(() => useCancelReservationRequestWallet(), { wrapper: createWrapper(queryClient) });
    let data;
    await act(async () => {
      data = await result.current.mutateAsync({ reservationKey: 'res-1' });
    });
    expect(data.hash).toBe('txHash');
  });

  test('useCancelBookingWallet executes transaction and returns hash', async () => {
    const { result } = renderHook(() => useCancelBookingWallet(), { wrapper: createWrapper(queryClient) });
    let data;
    await act(async () => {
      data = await result.current.mutateAsync({ reservationKey: 'res-1' });
    });
    expect(data.hash).toBe('txHash');
  });

  test('useRequestFundsWallet executes transaction and returns hash', async () => {
    const { result } = renderHook(() => useRequestFundsWallet(), { wrapper: createWrapper(queryClient) });
    let data;
    await act(async () => {
      data = await result.current.mutateAsync({ labId: 1, maxBatch: 10 });
    });
    expect(data.hash).toBe('txHash');
  });

  // Fatal error Wallet
  test('Wallet mutators clean up on transaction failure', async () => {
    const useContractWriteFunction = require('@/hooks/contract/useContractWriteFunction').default;
    useContractWriteFunction.mockReturnValue({ contractWriteFunction: jest.fn().mockRejectedValue(new Error('Tx failed')) });

    const { result: resReq } = renderHook(() => useReservationRequestWallet(), { wrapper: createWrapper(queryClient) });
    await act(async () => {
      await expect(resReq.current.mutateAsync({ tokenId: 1, start: 100, end: 200, userAddress: '0x1' })).rejects.toThrow('Tx failed');
    });

    const { result: cancelReq } = renderHook(() => useCancelReservationRequestWallet(), { wrapper: createWrapper(queryClient) });
    await act(async () => {
      await expect(cancelReq.current.mutateAsync('res-1')).rejects.toThrow('Tx failed');
    });
    
    useContractWriteFunction.mockReturnValue({ contractWriteFunction: jest.fn().mockResolvedValue('txHash') }); // reset
  });
});

describe('Router Hooks Coverage', () => {
  const queryClient = new QueryClient();

  beforeEach(() => {
    jest.clearAllMocks();
    useGetIsSSO.mockReturnValue(false); // Route to wallet
  });

  test('useReservationRequest routes to Wallet when not SSO', async () => {
    const { result } = renderHook(() => useReservationRequest(), { wrapper: createWrapper(queryClient) });
    let data;
    await act(async () => {
      data = await result.current.mutateAsync({ tokenId: 1, start: 100, end: 200, userAddress: '0x123' });
    });
    expect(data.hash).toBe('txHash');
  });

  test('useCancelReservationRequest routes to Wallet when not SSO', async () => {
    const { result } = renderHook(() => useCancelReservationRequest(), { wrapper: createWrapper(queryClient) });
    let data;
    await act(async () => {
      data = await result.current.mutateAsync({ reservationKey: 'res-1' });
    });
    expect(data.hash).toBe('txHash');
  });

  test('useCancelBooking routes to Wallet when not SSO', async () => {
    const { result } = renderHook(() => useCancelBooking(), { wrapper: createWrapper(queryClient) });
    let data;
    await act(async () => {
      data = await result.current.mutateAsync({ reservationKey: 'res-1' });
    });
    expect(data.hash).toBe('txHash');
  });

  test('useRequestFunds routes to Wallet when not SSO', async () => {
    const { result } = renderHook(() => useRequestFunds(), { wrapper: createWrapper(queryClient) });
    let data;
    await act(async () => {
      data = await result.current.mutateAsync({ labId: 1, maxBatch: 10 });
    });
    expect(data.hash).toBe('txHash');
  });
});

describe('SSO Hooks Coverage', () => {
  const queryClient = new QueryClient();

  beforeEach(() => {
    jest.clearAllMocks();
    global.window = { PublicKeyCredential: {} }; // Mock WebAuthn support
  });

  test('useReservationRequestSSO executes intent and polling', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ backendAuthToken: 'token', intent: { payload: { reservationKey: 'res-1' } } })
    });
    
    const awaitIntentAuth = require('@/utils/intents/authorizationOrchestrator').awaitIntentAuthorization;
    awaitIntentAuth.mockResolvedValue({ status: 'SUCCESS', requestId: 'req-1' });
    
    const pollIntentStatus = require('@/utils/intents/pollIntentStatus').default;
    pollIntentStatus.mockResolvedValue({ status: 'executed', txHash: '0x123', reservationKey: 'res-1' });

    const { result } = renderHook(() => useReservationRequestSSO(), { wrapper: createWrapper(queryClient) });
    let data;
    await act(async () => {
      data = await result.current.mutateAsync({ tokenId: 1, start: 100, end: 200, userAddress: '0x123' });
    });
    expect(data.requestId).toBe('req-1');
  });

  test('useCancelReservationRequestSSO executes intent and polling', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ backendAuthToken: 'token', intent: { payload: { reservationKey: 'res-1' } } })
    });
    const awaitIntentAuth = require('@/utils/intents/authorizationOrchestrator').awaitIntentAuthorization;
    awaitIntentAuth.mockResolvedValue({ status: 'SUCCESS', requestId: 'req-cancel' });
    const pollIntentStatus = require('@/utils/intents/pollIntentStatus').default;
    pollIntentStatus.mockResolvedValue({ status: 'executed', txHash: '0x123' });

    const { result } = renderHook(() => useCancelReservationRequestSSO(), { wrapper: createWrapper(queryClient) });
    let data;
    await act(async () => {
      data = await result.current.mutateAsync('res-1');
    });
    expect(data.reservationKey).toBe('res-1');
  });

  test('useCancelBookingSSO executes intent and polling', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ backendAuthToken: 'token', intent: { payload: { reservationKey: 'res-1' } } })
    });
    const awaitIntentAuth = require('@/utils/intents/authorizationOrchestrator').awaitIntentAuthorization;
    awaitIntentAuth.mockResolvedValue({ status: 'SUCCESS', requestId: 'req-cancel-book' });
    const pollIntentStatus = require('@/utils/intents/pollIntentStatus').default;
    pollIntentStatus.mockResolvedValue({ status: 'executed', txHash: '0x123' });

    const { result } = renderHook(() => useCancelBookingSSO(), { wrapper: createWrapper(queryClient) });
    let data;
    await act(async () => {
      data = await result.current.mutateAsync('res-1');
    });
    expect(data.reservationKey).toBe('res-1');
  });

  test('useRequestFundsSSO executes intent and polling', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ backendAuthToken: 'token', intent: {} })
    });
    const awaitIntentAuth = require('@/utils/intents/authorizationOrchestrator').awaitIntentAuthorization;
    awaitIntentAuth.mockResolvedValue({ status: 'SUCCESS', requestId: 'req-funds' });

    const { result } = renderHook(() => useRequestFundsSSO(), { wrapper: createWrapper(queryClient) });
    let data;
    await act(async () => {
      data = await result.current.mutateAsync({ labId: 1, maxBatch: 10 });
    });
    expect(data.requestId).toBe('req-funds');
  });

  // Fatal fetch error for SSO hooks
  test('SSO mutators clean up on prepare fail', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({})
    });
    const { result: resReq } = renderHook(() => useReservationRequestSSO(), { wrapper: createWrapper(queryClient) });
    await act(async () => {
      await expect(resReq.current.mutateAsync({ tokenId: 1, start: 100, end: 200 })).rejects.toThrow('Failed to prepare reservation intent: 500');
    });

    const { result: cancelReq } = renderHook(() => useCancelReservationRequestSSO(), { wrapper: createWrapper(queryClient) });
    await act(async () => {
      await expect(cancelReq.current.mutateAsync('res-1')).rejects.toThrow('Failed to prepare action intent: 500');
    });
  });

  // Polling rejection error
  test('useReservationRequestSSO rejects when intent fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ backendAuthToken: 'token', intent: { payload: { reservationKey: 'res-1' } } })
    });
    const awaitIntentAuth = require('@/utils/intents/authorizationOrchestrator').awaitIntentAuthorization;
    awaitIntentAuth.mockResolvedValue({ status: 'SUCCESS', requestId: 'req-fail' });
    const pollIntentStatus = require('@/utils/intents/pollIntentStatus').default;
    pollIntentStatus.mockResolvedValue({ status: 'failed', reason: 'Rejected' });

    const { result } = renderHook(() => useReservationRequestSSO(), { wrapper: createWrapper(queryClient) });
    await act(async () => {
      await result.current.mutateAsync({ tokenId: 1, start: 100, end: 200 });
    });
  });

  test('useCancelReservationRequestSSO rejects when intent fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ backendAuthToken: 'token', intent: { payload: { reservationKey: 'res-1' } } })
    });
    const awaitIntentAuth = require('@/utils/intents/authorizationOrchestrator').awaitIntentAuthorization;
    awaitIntentAuth.mockResolvedValue({ status: 'SUCCESS', requestId: 'req-fail' });
    const pollIntentStatus = require('@/utils/intents/pollIntentStatus').default;
    pollIntentStatus.mockResolvedValue({ status: 'failed', reason: 'Rejected' });

    const { result } = renderHook(() => useCancelReservationRequestSSO(), { wrapper: createWrapper(queryClient) });
    await act(async () => {
      await result.current.mutateAsync('res-1');
    });
  });

  test('useCancelBookingSSO rejects when intent fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ backendAuthToken: 'token', intent: { payload: { reservationKey: 'res-1' } } })
    });
    const awaitIntentAuth = require('@/utils/intents/authorizationOrchestrator').awaitIntentAuthorization;
    awaitIntentAuth.mockResolvedValue({ status: 'SUCCESS', requestId: 'req-fail' });
    const pollIntentStatus = require('@/utils/intents/pollIntentStatus').default;
    pollIntentStatus.mockResolvedValue({ status: 'failed', reason: 'Rejected' });

    const { result } = renderHook(() => useCancelBookingSSO(), { wrapper: createWrapper(queryClient) });
    await act(async () => {
      await result.current.mutateAsync('res-1');
    });
  });

  test('runActionIntent handles FAILED authorization', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ backendAuthToken: 'token', intent: {} })
    });
    const awaitIntentAuth = require('@/utils/intents/authorizationOrchestrator').awaitIntentAuthorization;
    awaitIntentAuth.mockResolvedValue({ status: 'FAILED', error: 'User denied' });

    const { result } = renderHook(() => useReservationRequestSSO(), { wrapper: createWrapper(queryClient) });
    await act(async () => {
      await expect(result.current.mutateAsync({ tokenId: 1, start: 100, end: 200 })).rejects.toThrow('User denied');
    });
  });

  test('runActionIntent handles CANCELLED authorization', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ backendAuthToken: 'token', intent: {} })
    });
    const awaitIntentAuth = require('@/utils/intents/authorizationOrchestrator').awaitIntentAuthorization;
    awaitIntentAuth.mockResolvedValue({ status: 'CANCELLED', error: 'User closed popup' });

    const { result } = renderHook(() => useReservationRequestSSO(), { wrapper: createWrapper(queryClient) });
    await act(async () => {
      await expect(result.current.mutateAsync({ tokenId: 1, start: 100, end: 200 })).rejects.toThrow('User closed popup');
    });
  });

  test('runActionIntent throws when WebAuthn is unsupported', async () => {
    global.window.PublicKeyCredential = undefined;
    const { result } = renderHook(() => useReservationRequestSSO(), { wrapper: createWrapper(queryClient) });
    await act(async () => {
      await expect(result.current.mutateAsync({ tokenId: 1, start: 100, end: 200 })).rejects.toThrow('WebAuthn not supported');
    });
  });
});
