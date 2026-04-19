import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock UserContext before importing hooks
const mockUserData = {
  address: '0xaaa0001',
  institutionBackendUrl: 'http://localhost:8080',
  isSSO: true,
};
jest.mock('@/context/UserContext', () => ({ useUser: () => mockUserData }));

import {
  useCreditAccountSummary,
  useCreditLots,
  useFundingOrders,
  useCreditMovements,
} from '../useBillingAccount';

const createTestQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0 } } });

const createWrapper = (qc) => ({ children }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);

describe('useBillingAccount hooks', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── useCreditAccountSummary ───────────────────────────────────────────
  test('useCreditAccountSummary fetches account balances', async () => {
    const account = { available: '150.0', locked: '20.0', consumed: '30.0', adjusted: '0', expired: '0' };
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => account });

    const qc = createTestQueryClient();
    const { result } = renderHook(() => useCreditAccountSummary(), { wrapper: createWrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(account);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8080/billing/credit-accounts/0xaaa0001',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  // ── useCreditLots ─────────────────────────────────────────────────────
  test('useCreditLots fetches lot expiry breakdown', async () => {
    const lots = [
      { id: 1, remaining: '100.0', expiresAt: '2026-04-15T00:00:00Z', expired: false },
      { id: 2, remaining: '50.0', expiresAt: null, expired: false },
    ];
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => lots });

    const qc = createTestQueryClient();
    const { result } = renderHook(() => useCreditLots(), { wrapper: createWrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8080/billing/credit-accounts/0xaaa0001/lots',
      expect.any(Object),
    );
  });

  // ── useFundingOrders ──────────────────────────────────────────────────
  test('useFundingOrders fetches pending orders', async () => {
    const orders = [{ id: 1, eurGrossAmount: '500.00', status: 'INVOICED', reference: 'REF-001' }];
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => orders });

    const qc = createTestQueryClient();
    const { result } = renderHook(() => useFundingOrders(), { wrapper: createWrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data[0].status).toBe('INVOICED');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8080/billing/funding-orders?institution=0xaaa0001',
      expect.any(Object),
    );
  });

  // ── useCreditMovements ────────────────────────────────────────────────
  test('useCreditMovements fetches recent movements with default limit', async () => {
    const movements = [
      { id: 1, movementType: 'MINT', amount: '500.0', createdAt: '2026-03-20T10:00:00Z' },
      { id: 2, movementType: 'LOCK', amount: '50.0', createdAt: '2026-03-21T14:00:00Z' },
    ];
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => movements });

    const qc = createTestQueryClient();
    const { result } = renderHook(() => useCreditMovements(), { wrapper: createWrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8080/billing/credit-accounts/0xaaa0001/movements?limit=20',
      expect.any(Object),
    );
  });

  test('useCreditMovements respects custom limit option', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => [] });

    const qc = createTestQueryClient();
    renderHook(() => useCreditMovements({ limit: 5 }), { wrapper: createWrapper(qc) });

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=5'),
        expect.any(Object),
      ),
    );
  });

  // ── disabled when not SSO ─────────────────────────────────────────────
  test('hooks are disabled when user is not SSO', async () => {
    mockUserData.isSSO = false;

    const qc = createTestQueryClient();
    const { result: r1 } = renderHook(() => useCreditAccountSummary(), { wrapper: createWrapper(qc) });
    const { result: r2 } = renderHook(() => useCreditMovements(), { wrapper: createWrapper(qc) });

    // Should stay idle — no fetch
    expect(r1.current.fetchStatus).toBe('idle');
    expect(r2.current.fetchStatus).toBe('idle');
    expect(global.fetch).not.toHaveBeenCalled();

    // restore
    mockUserData.isSSO = true;
  });
});
