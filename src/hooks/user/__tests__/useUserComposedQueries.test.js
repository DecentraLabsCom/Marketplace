import React from 'react';
import { renderHook } from '@testing-library/react-hooks';
jest.mock('../useUserAtomicQueries');
import {
  useProvidersWithNames,
  useProviderDetails,
  useAllUsersComposed,
  useProviderStatusComposed,
  useBatchProviderCheck,
  useAllUsersBasic,
  useAllUsersFull
} from '../useUserComposedQueries';
import * as atomic from '../useUserAtomicQueries';
import * as reactQuery from '@tanstack/react-query';

jest.mock('@tanstack/react-query', () => ({
  useQueries: jest.fn()
}));

describe('useUserComposedQueries hooks', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    atomic.useGetLabProviders.mockImplementation(() => ({
      data: { providers: [
        { account: '0x123', name: 'Alice' },
        { account: '0x456' }
      ], count: 2, timestamp: 'now' },
      isLoading: false,
      isSuccess: true,
      isError: false,
      error: null,
      refetch: jest.fn(),
      isFetching: false,
      isPaused: false,
      isStale: false,
      meta: { timestamp: 'now' }
    }));
    atomic.useIsLabProvider.mockImplementation(() => ({
      data: { isProvider: true },
      isLoading: false,
      isSuccess: true,
      isError: false,
      error: null,
      refetch: jest.fn(),
      isFetching: false,
      isPaused: false,
      isStale: false
    }));
    reactQuery.useQueries.mockImplementation(({ queries, combine }) => {
      const results = queries.map(q => ({
        data: { isProvider: true }, isLoading: false, error: null, refetch: jest.fn()
      }));
      return combine ? combine(results) : results;
    });
  });

  test('useProvidersWithNames returns formatted provider list', () => {
    const result = useProvidersWithNames();
    expect(result.data).toEqual([
      { account: '0x123', name: 'Alice', displayName: 'Alice' },
      { account: '0x456', displayName: '0x456' }
    ]);
    expect(result.meta.totalProviders).toBe(2);
  });

  test('useProviderDetails returns provider details and status', () => {
    const result = useProviderDetails('0x123');
    expect(result.data.isProvider).toBe(true);
    expect(result.data.details).toEqual({ account: '0x123', name: 'Alice' });
  });

  test('useAllUsersComposed returns providers and meta', () => {
    const result = useAllUsersComposed();
    expect(result.data.providers.length).toBe(2);
    expect(result.meta.totalQueries).toBe(1);
    expect(result.isSuccess).toBe(true);
  });

  test('useProviderStatusComposed returns provider status and details', () => {
    const result = useProviderStatusComposed('0x123');
    expect(result.data.address).toBe('0x123');
    expect(result.data.isProvider).toBe(true);
    expect(result.data.name).toBe('Alice');
    expect(result.data.details).toEqual({ account: '0x123', name: 'Alice' });
    expect(result.isSuccess).toBe(true);
  });

  test('useProviderStatusComposed returns error when provider address is missing', () => {
    const result = useProviderStatusComposed('');
    expect(result.isError).toBe(true);
    expect(result.data.address).toBeNull();
    expect(result.error.message).toBe('Provider address is required');
    expect(result.meta.failedQueries).toBe(1);
  });

  test('useProviderStatusComposed handles partial failure', () => {
    atomic.useGetLabProviders.mockImplementation(() => ({
      data: null, isLoading: false, isSuccess: false, isError: true, error: new Error('API down'), refetch: jest.fn()
    }));
    const result = useProviderStatusComposed('0x123');
    expect(result.isError).toBe(true);
    expect(result.meta.hasPartialFailures).toBe(true); // one succeeded (isLabProvider), one failed
  });

  test('useBatchProviderCheck combines multiple check queries', () => {
    const refetchMock = jest.fn();
    reactQuery.useQueries.mockImplementation(({ queries, combine }) => {
      const results = queries.map((q, i) => ({
        data: { isProvider: i === 0 }, isLoading: false, error: null, refetch: refetchMock
      }));
      return combine(results);
    });
    
    const result = useBatchProviderCheck(['0x123', '0x456']);
    expect(result.data['0x123']).toEqual({ isProvider: true });
    expect(result.data['0x456']).toEqual({ isProvider: false });
    expect(result.isLoading).toBe(false);
    
    result.refetch();
    expect(refetchMock).toHaveBeenCalledTimes(2);
  });

  test('aliases useAllUsersBasic and useAllUsersFull return composed data', () => {
    const basicResult = useAllUsersBasic();
    const fullResult = useAllUsersFull();
    expect(basicResult.data.providers.length).toBe(2);
    expect(fullResult.data.providers.length).toBe(2);
  });
});
import {
  extractProviderFromComposed,
  isProviderFromComposed,
  getProviderNameFromComposed
} from '../useUserComposedQueries';

describe('useUserComposedQueries helpers', () => {
  const composedResult = {
    data: {
      providers: [
        { account: '0x123', name: 'Alice' },
        { account: '0x456', name: 'Bob' },
        { account: '0x789' }
      ]
    }
  };

  test('extractProviderFromComposed returns provider by address', () => {
    expect(extractProviderFromComposed(composedResult, '0x123')).toEqual({ account: '0x123', name: 'Alice' });
    expect(extractProviderFromComposed(composedResult, '0x456')).toEqual({ account: '0x456', name: 'Bob' });
    expect(extractProviderFromComposed(composedResult, '0x789')).toEqual({ account: '0x789' });
    expect(extractProviderFromComposed(composedResult, '0x000')).toBeNull();
    expect(extractProviderFromComposed(null, '0x123')).toBeNull();
    expect(extractProviderFromComposed(composedResult, null)).toBeNull();
  });

  test('isProviderFromComposed returns true if address is a provider', () => {
    expect(isProviderFromComposed(composedResult, '0x123')).toBe(true);
    expect(isProviderFromComposed(composedResult, '0x456')).toBe(true);
    expect(isProviderFromComposed(composedResult, '0x789')).toBe(true);
    expect(isProviderFromComposed(composedResult, '0x000')).toBe(false);
    expect(isProviderFromComposed(null, '0x123')).toBe(false);
    expect(isProviderFromComposed(composedResult, null)).toBe(false);
  });

  test('getProviderNameFromComposed returns provider name if available', () => {
    expect(getProviderNameFromComposed(composedResult, '0x123')).toBe('Alice');
    expect(getProviderNameFromComposed(composedResult, '0x456')).toBe('Bob');
    expect(getProviderNameFromComposed(composedResult, '0x789')).toBeNull();
    expect(getProviderNameFromComposed(composedResult, '0x000')).toBeNull();
    expect(getProviderNameFromComposed(null, '0x123')).toBeNull();
    expect(getProviderNameFromComposed(composedResult, null)).toBeNull();
  });
});
