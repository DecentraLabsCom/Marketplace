/**
 * Atomic React Query Hooks for User/Provider-related queries.
 * Marketplace runtime uses institutional/API-backed variants only.
 * 
 * Note: useSSOSessionQuery is institutional SSO-only.
 * 
 * Configuration:
 * - staleTime: 2 hours (7,200,000ms)
 * - gcTime: 12 hours (43,200,000ms)
 * - refetchOnWindowFocus: false
 * - refetchInterval: false
 * - refetchOnReconnect: true
 * - retry: 1
 */
import { useQuery } from '@tanstack/react-query'
import { createSSRSafeQuery } from '@/utils/hooks/ssrSafe'
import { userQueryKeys, providerQueryKeys } from '@/utils/hooks/queryKeys'
import devLog from '@/utils/dev/logger'

// Common configuration for all user/provider hooks
export const USER_QUERY_CONFIG = {
  staleTime: 2 * 60 * 60 * 1000,   // 2 hours
  gcTime: 12 * 60 * 60 * 1000,     // 12 hours
  refetchOnWindowFocus: false,
  refetchInterval: false,
  refetchOnReconnect: true,
  retry: 1,
}

// ===== useGetLabProviders Hook Family =====

// Define queryFn first for reuse
const getLabProvidersQueryFn = createSSRSafeQuery(async () => {
  const response = await fetch('/api/contract/provider/getLabProviders', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch lab providers: ${response.status}`);
  }
  
  const data = await response.json();
  return data;
}, []); // Return empty array during SSR

/**
 * Hook for /api/contract/provider/getLabProviders endpoint (SSO users)
 * Gets all registered lab providers from the smart contract via API + Ethers
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with providers data
 */
export const useGetLabProvidersSSO = (options = {}) => {
  return useQuery({
    queryKey: providerQueryKeys.getLabProviders(),
    queryFn: () => getLabProvidersQueryFn(),
    ...USER_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks and mutations
useGetLabProvidersSSO.queryFn = getLabProvidersQueryFn;

/**
 * Hook for provider-list reads in the institutional runtime.
 * @param {Object} [options={}] - Additional query options
 * @returns {Object} React Query result with providers data
 */
export const useGetLabProviders = (options = {}) => {
  return useGetLabProvidersSSO({
    ...options,
    enabled: options.enabled !== false,
  });
};

// ===== useIsLabProvider Hook Family =====

// Define queryFn first for reuse
const getIsLabProviderQueryFn = createSSRSafeQuery(async ({ userAddress }) => {
  if (!userAddress) throw new Error('Address is required');
  
  const response = await fetch(`/api/contract/provider/isLabProvider?wallet=${userAddress}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to check provider status: ${response.status}`);
  }
  
  const data = await response.json();
  return data;
}, { isProvider: false }); // Return false during SSR

/**
 * Hook for /api/contract/provider/isLabProvider endpoint (SSO users)
 * Checks if an address is a registered lab provider via API + Ethers
 * @param {string} address - Address to check
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with provider status
 */
export const useIsLabProviderSSO = (address, options = {}) => {
  return useQuery({
    queryKey: providerQueryKeys.isLabProvider(address),
    queryFn: () => getIsLabProviderQueryFn({ userAddress: address }),
    enabled: !!address,
    ...USER_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks and mutations
useIsLabProviderSSO.queryFn = getIsLabProviderQueryFn;

/**
 * Hook for provider-status reads in the institutional runtime.
 * @param {string} address - Address to check
 * @param {Object} [options={}] - Additional query options
 * @returns {Object} React Query result with provider status
 */
export const useIsLabProvider = (address, options = {}) => {
  return useIsLabProviderSSO(address, {
    ...options,
    enabled: options.enabled !== false && !!address,
  });
};

// ===== SSO SESSION QUERIES =====

// Define queryFn first for reuse
const getSSOSessionQueryFn = createSSRSafeQuery(async () => {
  const response = await fetch('/api/auth/sso/session', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // Include cookies for session authentication
  });
  
  if (!response.ok) {
    // If session doesn't exist or expired, return null instead of throwing
    if (response.status === 401 || response.status === 404) {
      return { user: null, isSSO: false };
    }
    throw new Error(`Failed to fetch SSO session: ${response.status}`);
  }
  
  const data = await response.json();
  devLog.log('getSSOSessionQueryFn:', data);
  
  // Return consistent format
  return {
    user: data.user,
    isSSO: Boolean(data.user)
  };
}, { user: null, isSSO: false }); // Return null user during SSR

/**
 * SSO Session Query Hook
 * @param {Object} options - Query options
 * @returns {Object} React Query result for SSO session
 */
export const useSSOSessionQuery = (options = {}) => {
  return useQuery({
    queryKey: userQueryKeys.ssoSession(),
    queryFn: () => getSSOSessionQueryFn(), // ✅ Reuse the queryFn
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes
    ...options,
  });
};

// Export queryFn for use in composed hooks and mutations
useSSOSessionQuery.queryFn = getSSOSessionQueryFn;

devLog.moduleLoaded('✅ User atomic queries loaded');
