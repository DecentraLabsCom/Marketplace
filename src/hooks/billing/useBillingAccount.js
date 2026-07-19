"use client";
/**
 * React Query hook for fetching billing credit account data for institutional users.
 * Reads from the institution's Lab Gateway billing API:
 *   GET /billing/credit-accounts/{address}         – account-level balances
 *   GET /billing/credit-accounts/{address}/lots    – credit lots with expiry info
 *   GET /billing/funding-orders?institution={addr} – funding orders awaiting action
 */
import { useQuery } from '@tanstack/react-query';
import { useUser } from '@/context/UserContext';
import devLog from '@/utils/dev/logger';

const STALE_TIME = 2 * 60 * 1000; // 2 minutes

export class BillingFetchError extends Error {
  constructor(url, status) {
    super(`HTTP ${status} from ${url}`);
    this.name = 'BillingFetchError';
    this.url = url;
    this.status = status;
    this.code = status === 404 ? 'CREDIT_ACCOUNT_NOT_FOUND' : 'BILLING_REQUEST_FAILED';
  }
}

const safeFetch = async (url) => {
  const res = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) throw new BillingFetchError(url, res.status);
  return res.json();
};

/**
 * Fetch the credit account summary (balances) for an institutional user.
 */
export const useCreditAccountSummary = (options = {}) => {
  const { address, isSSO } = useUser();
  const enabled = Boolean(isSSO && address) && (options.enabled !== false);

  return useQuery({
    queryKey: ['billing', 'creditAccount', address],
    queryFn: async () => {
      const url = '/api/billing/credit-account';
      devLog.log('useCreditAccountSummary – fetching', url);
      return safeFetch(url);
    },
    enabled,
    staleTime: STALE_TIME,
    retry: 1,
    ...options,
  });
};

/**
 * Fetch the credit lots for an institutional user (expiry breakdown).
 */
export const useCreditLots = (options = {}) => {
  const { address, isSSO } = useUser();
  const enabled = Boolean(isSSO && address) && (options.enabled !== false);

  return useQuery({
    queryKey: ['billing', 'creditLots', address],
    queryFn: async () => {
      const url = '/api/billing/credit-account/lots';
      devLog.log('useCreditLots – fetching', url);
      return safeFetch(url);
    },
    enabled,
    staleTime: STALE_TIME,
    retry: 1,
    ...options,
  });
};

/**
 * Fetch the funding orders associated with an institutional user.
 */
export const useFundingOrders = (options = {}) => {
  const { address, isSSO } = useUser();
  const enabled = Boolean(isSSO && address) && (options.enabled !== false);

  return useQuery({
    queryKey: ['billing', 'fundingOrders', address],
    queryFn: async () => {
      const url = '/api/billing/funding-orders';
      devLog.log('useFundingOrders – fetching', url);
      return safeFetch(url);
    },
    enabled,
    staleTime: STALE_TIME,
    retry: 1,
    ...options,
  });
};

/**
 * Fetch recent credit movements (activity history) for an institutional user.
 * Returns the most recent movements (default limit: 20).
 */
export const useCreditMovements = (options = {}) => {
  const { address, isSSO } = useUser();
  const limit = options.limit ?? 20;
  const enabled = Boolean(isSSO && address) && (options.enabled !== false);

  return useQuery({
    queryKey: ['billing', 'creditMovements', address, limit],
    queryFn: async () => {
      const url = `/api/billing/credit-account/movements?limit=${encodeURIComponent(limit)}`;
      devLog.log('useCreditMovements – fetching', url);
      return safeFetch(url);
    },
    enabled,
    staleTime: STALE_TIME,
    retry: 1,
    ...options,
  });
};
