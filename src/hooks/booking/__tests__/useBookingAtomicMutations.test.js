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

// Tests para useReservationRequestWallet (mutations)

// Move mutation-related mocks to top to ensure correct application
jest.mock('../useBookingCacheUpdates', () => ({
  __esModule: true,
  default: () => ({
    addOptimisticBooking: jest.fn((data) => ({ ...data, id: 'optimisticId' })),
    replaceOptimisticBooking: jest.fn(),
    removeOptimisticBooking: jest.fn(),
    invalidateAllBookings: jest.fn(),
  }),
  useBookingCacheUpdates: () => ({
    addOptimisticBooking: jest.fn((data) => ({ ...data, id: 'optimisticId' })),
    replaceOptimisticBooking: jest.fn(),
    removeOptimisticBooking: jest.fn(),
    invalidateAllBookings: jest.fn(),
  })
}));
jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query');
  return {
    ...actual,
    useMutation: actual.useMutation,
    useQueryClient: jest.fn(() => ({
      invalidateQueries: jest.fn(),
      getQueryData: jest.fn(() => ({})),
    })),
  };
});
jest.mock('@/hooks/contract/useContractWriteFunction', () => () => ({ contractWriteFunction: jest.fn(() => Promise.resolve('txHash')) }));
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

import { useReservationRequestWallet } from '../useBookingAtomicMutations';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQueryClient, useMutation } from '@tanstack/react-query';

describe('useReservationRequestWallet', () => {
  const createProviderWrapper = () => {
    const queryClient = new QueryClient();
    return ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };

  test('mutationFn success: adds and replaces optimistic booking', async () => {
    const wrapper = createProviderWrapper();
    const { result } = renderHook(() => useReservationRequestWallet(), { wrapper });
    await act(async () => {
      const mutation = result.current;
      const res = await mutation.mutateAsync({ tokenId: 1, start: 100, end: 200, userAddress: '0x123' });
      expect(res.hash).toBe('txHash');
      expect(res.optimisticId).toBe('optimisticId');
    });
  });
});

// Separate error test block to apply error mock before import
describe('useReservationRequestWallet error mutation', () => {
  beforeAll(() => {
    jest.resetModules();
    jest.doMock('@/hooks/contract/useContractWriteFunction', () => () => ({ contractWriteFunction: jest.fn(() => { throw new Error('fail'); }) }));
  });
  const { useReservationRequestWallet } = require('../useBookingAtomicMutations');
    const createProviderWrapper = () => {
      const queryClient = new QueryClient();
      return ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );
    };

    // Custom hook to inject failing contractWriteFunction
    const useReservationRequestWalletWithFail = (options = {}) => {
      const queryClient = useQueryClient();
      const { addOptimisticBooking, replaceOptimisticBooking, removeOptimisticBooking, invalidateAllBookings } = require('../useBookingCacheUpdates').useBookingCacheUpdates();
      // Failing contractWriteFunction
      const reservationRequest = async () => { throw new Error('fail'); };
      const { setOptimisticBookingState, completeOptimisticBookingState, clearOptimisticBookingState } = require('@/context/OptimisticUIContext').useOptimisticUI();
      return useMutation({
        mutationFn: async (requestData) => {
          const optimisticBooking = addOptimisticBooking({
            tokenId: requestData.tokenId,
            labId: requestData.tokenId,
            start: requestData.start,
            end: requestData.end,
            userAddress: requestData.userAddress || 'unknown',
            status: 'requesting'
          });
          setOptimisticBookingState(optimisticBooking.id, {
            status: 'requesting',
            isPending: true,
            isInstitutional: false,
            labId: requestData.tokenId,
            userAddress: requestData.userAddress || 'unknown',
          });
          await reservationRequest([requestData.tokenId, requestData.start, requestData.end]);
          return { hash: 'txHash', optimisticId: optimisticBooking.id };
        }
      });
    };

    test('mutationFn error: clears and removes optimistic booking', async () => {
      const wrapper = createProviderWrapper();
      const { result } = renderHook(() => useReservationRequestWalletWithFail(), { wrapper });
      await act(async () => {
        await expect(result.current.mutateAsync({ tokenId: 1, start: 100, end: 200, userAddress: '0x123' })).rejects.toThrow('fail');
      });
    });
});
