import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMetadata, METADATA_QUERY_CONFIG } from '@/hooks/metadata/useMetadata';

global.fetch = jest.fn();

jest.mock('@/utils/dev/logger', () => ({
  __esModule: true,
  default: { log: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn(), moduleLoaded: jest.fn() },
}));

jest.mock('@/utils/hooks/ssrSafe', () => ({
  createSSRSafeQuery: jest.fn((queryFn, defaultValue) => {
    return (...args) => {
      if (typeof window === 'undefined') return Promise.resolve(defaultValue);
      return queryFn(...args);
    };
  }),
}));

jest.mock('@/utils/hooks/queryKeys', () => ({
  metadataQueryKeys: {
    byUri: jest.fn((uri) => ['metadata', 'byUri', uri]),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, cacheTime: 0, staleTime: 0 } },
  });
  return ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useMetadata', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch.mockClear();
  });

  test('METADATA_QUERY_CONFIG has correct settings', () => {
    expect(METADATA_QUERY_CONFIG).toEqual({
      staleTime: 2 * 60 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 2,
    });
  });

  test('fetches metadata successfully', async () => {
    const uri = 'ipfs://QmTest123';
    const mockMetadata = { name: 'Test Lab', description: 'Test' };
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockMetadata,
    });

    const { result } = renderHook(() => useMetadata(uri), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockMetadata);
    expect(global.fetch).toHaveBeenCalledWith(`/api/metadata?uri=${encodeURIComponent(uri)}`, expect.any(Object));
  });

  test('is disabled when uri is not provided', () => {
    const { result } = renderHook(() => useMetadata(null), {
      wrapper: createWrapper(),
    });
    expect(result.current.fetchStatus).toBe('idle');
  });

  test('exposes queryFn for composition', () => {
    expect(useMetadata.queryFn).toBeDefined();
    expect(typeof useMetadata.queryFn).toBe('function');
  });
});
