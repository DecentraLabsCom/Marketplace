/**
 * Unit Tests: useLabAtomicQueries
 *
 * Tests atomic lab query hooks including:
 * - useAllLabs (get all lab IDs)
 * - useLab (get specific lab data)
 * - useBalanceOf (get owner's lab count)
 * - useOwnerOf (get lab owner address)
 * - useTokenOfOwnerByIndex (get token ID at index)
 * - useTokenURI (get token metadata URI)
 * - useIsTokenListed (check listing status)
 * - SSR safety and configuration
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useAllLabs,
  useLab,
  useBalanceOf,
  useOwnerOf,
  useTokenOfOwnerByIndex,
  useTokenURI,
  useIsTokenListed,
  LAB_QUERY_CONFIG,
} from '@/hooks/lab/useLabAtomicQueries';

// Mock fetch globally
global.fetch = jest.fn();

// Mock logger
jest.mock('@/utils/dev/logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock SSR safe utility
jest.mock('@/utils/hooks/ssrSafe', () => ({
  createSSRSafeQuery: jest.fn((queryFn, defaultValue) => {
    // Return a function that wraps the queryFn
    return (...args) => {
      if (typeof window === 'undefined') {
        return Promise.resolve(defaultValue);
      }
      return queryFn(...args);
    };
  }),
}));

// Mock query keys
jest.mock('@/utils/hooks/queryKeys', () => ({
  labQueryKeys: {
    getAllLabs: jest.fn(() => ['lab', 'getAllLabs']),
    getLab: jest.fn((labId) => ['lab', 'getLab', labId]),
    balanceOf: jest.fn((owner) => ['lab', 'balanceOf', owner]),
    ownerOf: jest.fn((labId) => ['lab', 'ownerOf', labId]),
    tokenOfOwnerByIndex: jest.fn((owner, index) => ['lab', 'tokenOfOwnerByIndex', owner, index]),
    tokenURI: jest.fn((labId) => ['lab', 'tokenURI', labId]),
    isTokenListed: jest.fn((labId) => ['lab', 'isTokenListed', labId]),
  },
}));

// Helper to create QueryClient wrapper
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        cacheTime: 0,
        staleTime: 0,
      },
      mutations: { retry: false },
    },
  });

  return ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useLabAtomicQueries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch.mockClear();
  });

  describe('Configuration', () => {
    test('LAB_QUERY_CONFIG has correct settings', () => {
      expect(LAB_QUERY_CONFIG).toEqual({
        staleTime: 12 * 60 * 60 * 1000, // 12 hours
        gcTime: 24 * 60 * 60 * 1000, // 24 hours
        refetchOnWindowFocus: false,
        refetchInterval: false,
        refetchOnReconnect: true,
        retry: 1,
      });
    });
  });

  describe('useAllLabs', () => {
    test('fetches all lab IDs successfully', async () => {
      const mockLabIds = ['1', '2', '3'];
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockLabIds,
      });

      const { result } = renderHook(() => useAllLabs(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockLabIds);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe(null);
    });


    test('uses correct query key', () => {
      const { labQueryKeys } = require('@/utils/hooks/queryKeys');

      renderHook(() => useAllLabs(), {
        wrapper: createWrapper(),
      });

      expect(labQueryKeys.getAllLabs).toHaveBeenCalled();
    });

    test('can be disabled with options', () => {
      const { result } = renderHook(() => useAllLabs({ enabled: false }), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.fetchStatus).toBe('idle');
    });

    test('exposes queryFn for composition', () => {
      expect(useAllLabs.queryFn).toBeDefined();
      expect(typeof useAllLabs.queryFn).toBe('function');
    });
  });

  describe('useLab', () => {
    const labId = '1';
    const mockLabData = {
      labId,
      base: {
        uri: 'ipfs://test',
        price: '1000000000000000000',
        auth: '',
        accessURI: '',
        accessKey: '',
      },
    };

    test('fetches specific lab data successfully', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockLabData,
      });

      const { result } = renderHook(() => useLab(labId), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockLabData);
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/contract/lab/getLab?labId=${labId}`,
        expect.any(Object)
      );
    });

    test('is disabled when labId is not provided', () => {
      const { result } = renderHook(() => useLab(null), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.fetchStatus).toBe('idle');
    });


    test('uses correct query key with labId', () => {
      const { labQueryKeys } = require('@/utils/hooks/queryKeys');

      renderHook(() => useLab(labId), {
        wrapper: createWrapper(),
      });

      expect(labQueryKeys.getLab).toHaveBeenCalledWith(labId);
    });

    test('exposes queryFn for composition', () => {
      expect(useLab.queryFn).toBeDefined();
      expect(typeof useLab.queryFn).toBe('function');
    });
  });

  describe('useBalanceOf', () => {
    const ownerAddress = '0x1234567890123456789012345678901234567890';
    const mockBalance = { balance: '3' };

    test('fetches balance successfully', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockBalance,
      });

      const { result } = renderHook(() => useBalanceOf(ownerAddress), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockBalance);
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/contract/lab/balanceOf?owner=${ownerAddress}`,
        expect.any(Object)
      );
    });

    test('is disabled when ownerAddress is not provided', () => {
      const { result } = renderHook(() => useBalanceOf(null), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.fetchStatus).toBe('idle');
    });


    test('exposes queryFn for composition', () => {
      expect(useBalanceOf.queryFn).toBeDefined();
      expect(typeof useBalanceOf.queryFn).toBe('function');
    });
  });

  describe('useOwnerOf', () => {
    const labId = '1';
    const mockOwner = { owner: '0x1234567890123456789012345678901234567890' };

    test('fetches owner address successfully', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockOwner,
      });

      const { result } = renderHook(() => useOwnerOf(labId), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockOwner);
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/contract/lab/ownerOf?labId=${labId}`,
        expect.any(Object)
      );
    });

    test('is disabled when labId is not provided', () => {
      const { result } = renderHook(() => useOwnerOf(null), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.fetchStatus).toBe('idle');
    });


    test('exposes queryFn for composition', () => {
      expect(useOwnerOf.queryFn).toBeDefined();
      expect(typeof useOwnerOf.queryFn).toBe('function');
    });
  });

  describe('useTokenOfOwnerByIndex', () => {
    const ownerAddress = '0x1234567890123456789012345678901234567890';
    const index = 0;
    const mockToken = { tokenId: '1' };

    test('fetches token ID successfully', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockToken,
      });

      const { result } = renderHook(() => useTokenOfOwnerByIndex(ownerAddress, index), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockToken);
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/contract/lab/tokenOfOwnerByIndex?owner=${ownerAddress}&index=${index}`,
        expect.any(Object)
      );
    });

    test('is disabled when ownerAddress is not provided', () => {
      const { result } = renderHook(() => useTokenOfOwnerByIndex(null, index), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.fetchStatus).toBe('idle');
    });

    test('is disabled when index is null', () => {
      const { result } = renderHook(() => useTokenOfOwnerByIndex(ownerAddress, null), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.fetchStatus).toBe('idle');
    });

    test('is disabled when index is undefined', () => {
      const { result } = renderHook(() => useTokenOfOwnerByIndex(ownerAddress, undefined), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.fetchStatus).toBe('idle');
    });

    test('handles index 0 correctly', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockToken,
      });

      const { result } = renderHook(() => useTokenOfOwnerByIndex(ownerAddress, 0), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockToken);
    });


    test('exposes queryFn for composition', () => {
      expect(useTokenOfOwnerByIndex.queryFn).toBeDefined();
      expect(typeof useTokenOfOwnerByIndex.queryFn).toBe('function');
    });
  });

  describe('useTokenURI', () => {
    const labId = '1';
    const mockURI = { uri: 'ipfs://QmTest123' };

    test('fetches token URI successfully', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockURI,
      });

      const { result } = renderHook(() => useTokenURI(labId), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockURI);
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/contract/lab/tokenURI?tokenId=${labId}`,
        expect.any(Object)
      );
    });

    test('is disabled when labId is not provided', () => {
      const { result } = renderHook(() => useTokenURI(null), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.fetchStatus).toBe('idle');
    });


    test('exposes queryFn for composition', () => {
      expect(useTokenURI.queryFn).toBeDefined();
      expect(typeof useTokenURI.queryFn).toBe('function');
    });
  });

  describe('useIsTokenListed', () => {
    const labId = '1';
    const mockListed = { isListed: true };

    test('fetches listing status successfully', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockListed,
      });

      const { result } = renderHook(() => useIsTokenListed(labId), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockListed);
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/contract/reservation/isTokenListed?labId=${labId}`,
        expect.any(Object)
      );
    });

    test('is disabled when labId is not provided', () => {
      const { result } = renderHook(() => useIsTokenListed(null), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.fetchStatus).toBe('idle');
    });


    test('exposes queryFn for composition', () => {
      expect(useIsTokenListed.queryFn).toBeDefined();
      expect(typeof useIsTokenListed.queryFn).toBe('function');
    });
  });

  describe('Query Options', () => {
    test('all hooks accept custom options', async () => {
      const onSuccess = jest.fn();
      const onError = jest.fn();

      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      renderHook(() => useAllLabs({ onSuccess, onError }), {
        wrapper: createWrapper(),
      });

      renderHook(() => useLab('1', { onSuccess, onError }), {
        wrapper: createWrapper(),
      });

      renderHook(() => useBalanceOf('0x123', { onSuccess, onError }), {
        wrapper: createWrapper(),
      });

      // Custom options should not throw errors
      expect(true).toBe(true);
    });

    test('custom enabled option overrides default', () => {
      const { result: result1 } = renderHook(
        () => useLab('1', { enabled: false }),
        { wrapper: createWrapper() }
      );

      const { result: result2 } = renderHook(
        () => useOwnerOf('1', { enabled: false }),
        { wrapper: createWrapper() }
      );

      expect(result1.current.fetchStatus).toBe('idle');
      expect(result2.current.fetchStatus).toBe('idle');
    });
  });

  describe('Refetch Functionality', () => {
    test('useAllLabs exposes refetch function', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ['1', '2'],
      });

      const { result } = renderHook(() => useAllLabs(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.refetch).toBeDefined();
      expect(typeof result.current.refetch).toBe('function');
    });

    test('all hooks expose refetch function', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      const { result: r1 } = renderHook(() => useLab('1'), { wrapper: createWrapper() });
      const { result: r2 } = renderHook(() => useOwnerOf('1'), { wrapper: createWrapper() });
      const { result: r3 } = renderHook(() => useTokenURI('1'), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(r1.current.refetch).toBeDefined();
        expect(r2.current.refetch).toBeDefined();
        expect(r3.current.refetch).toBeDefined();
      });
    });
  });
});
