import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useReservation,
  useReservationsOfToken,
  BOOKING_QUERY_CONFIG,
} from '@/hooks/booking/useBookingAtomicQueries';

global.fetch = jest.fn();

jest.mock('@/utils/dev/logger', () => ({
  __esModule: true,
  default: { log: jest.fn(), error: jest.fn() },
}));

jest.mock('@/utils/hooks/ssrSafe', () => ({
  createSSRSafeQuery: jest.fn((queryFn, defaultValue) => {
    return (...args) => typeof window === 'undefined' ? Promise.resolve(defaultValue) : queryFn(...args);
  }),
}));

jest.mock('@/utils/hooks/queryKeys', () => ({
  bookingQueryKeys: {
    byReservationKey: jest.fn((key) => ['booking', 'reservation', key]),
    getReservationsOfToken: jest.fn((labId) => ['booking', 'token', labId]),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, cacheTime: 0 } },
  });
  return ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};

describe('useBookingAtomicQueries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch.mockClear();
  });

  test('BOOKING_QUERY_CONFIG exists', () => {
    expect(BOOKING_QUERY_CONFIG).toBeDefined();
    expect(BOOKING_QUERY_CONFIG.staleTime).toBe(15 * 60 * 1000);
  });

  test('useReservation fetches successfully', async () => {
    const mockData = { user: '0x123', labId: '1' };
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => mockData });
    const { result } = renderHook(() => useReservation('key1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
  });

  test('useReservation disabled without key', () => {
    const { result } = renderHook(() => useReservation(null), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
  });

  test('useReservationsOfToken fetches', async () => {
    const mockData = [];
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => mockData });
    const { result } = renderHook(() => useReservationsOfToken('1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  test('useReservationsOfToken disabled without labId', () => {
    const { result } = renderHook(() => useReservationsOfToken(null), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
  });
});
