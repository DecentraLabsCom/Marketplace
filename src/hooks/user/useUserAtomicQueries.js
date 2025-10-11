/**
 * Atomic React Query Hooks for User/Provider-related queries
 * Each hook has 3 variants following the same pattern as mutations:
 * - useXSSO: Server-side query via API + Ethers (for SSO users)
 *   * Each hook maps 1:1 to a specific API endpoint in /api/contract/user
 * - useXWallet: Client-side query via Wagmi (for wallet users)
 * - useX: Router that selects SSO or Wallet based on user.loginType
 * 
 * Note: useSSOSessionQuery is SSO-only by nature (no Wallet variant)
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
import { getIsSSO } from '@/utils/hooks/getIsSSO'
import useDefaultReadContract from '@/hooks/contract/useDefaultReadContract'
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
 * Hook for getLabProviders contract read (Wallet users)
 * Gets all registered lab providers directly from blockchain via Wagmi
 * @param {Object} [options={}] - Additional wagmi options
 * @returns {Object} Wagmi query result with providers data normalized to match SSO structure
 */
export const useGetLabProvidersWallet = (options = {}) => {
  const result = useDefaultReadContract('getLabProviders', [], {
      ...USER_QUERY_CONFIG,
      ...options,
    });
  
  // Normalize the data after it's fetched
  return {
    ...result,
    data: result.data ? (() => {
      const data = result.data;
      if (!data || !Array.isArray(data)) return { providers: [], count: 0 };
      
      // Transform blockchain data to match API format
      const providers = data.map(provider => ({
        account: provider.account,
        name: provider.base?.name || provider.name,
        email: provider.base?.email || provider.email,
        country: provider.base?.country || provider.country
      }));
      
      return {
        providers,
        count: providers.length,
        timestamp: new Date().toISOString()
      };
    })() : null
  };
};

/**
 * Hook for getLabProviders (Router - selects SSO or Wallet)
 * Gets all registered lab providers - routes to API or Wagmi based on user type
 * @param {Object} [options={}] - Additional query options
 * @param {boolean} [options.isSSO] - Optional: force SSO or Wallet mode (for use outside UserContext)
 * @returns {Object} React Query result with providers data
 */
export const useGetLabProviders = (options = {}) => {
  const isSSO = getIsSSO(options);
  
  const ssoQuery = useGetLabProvidersSSO({ ...options, enabled: isSSO && options.enabled !== false });
  const walletQuery = useGetLabProvidersWallet({ ...options, enabled: !isSSO && options.enabled !== false });
  
  return isSSO ? ssoQuery : walletQuery;
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
 * Hook for isLabProvider contract read (Wallet users)
 * Checks if an address is a registered lab provider directly from blockchain via Wagmi
 * @param {string} address - Address to check
 * @param {Object} [options={}] - Additional wagmi options
 * @returns {Object} Wagmi query result with provider status normalized to match SSO structure
 */
export const useIsLabProviderWallet = (address, options = {}) => {
  const result = useDefaultReadContract('isLabProvider', [address], {
      enabled: !!address,
      ...USER_QUERY_CONFIG,
      ...options,
    });
  
  // Normalize the data after it's fetched
  return {
    ...result,
    data: result.data !== undefined ? {
      wallet: address?.toLowerCase(),
      isLabProvider: Boolean(result.data),
      checked: true
    } : null
  };
};

/**
 * Hook for isLabProvider (Router - selects SSO or Wallet)
 * Checks if an address is a registered lab provider - routes to API or Wagmi based on user type
 * @param {string} address - Address to check
 * @param {Object} [options={}] - Additional query options
 * @param {boolean} [options.isSSO] - Optional: force SSO or Wallet mode (for use outside UserContext)
 * @returns {Object} React Query result with provider status
 */
export const useIsLabProvider = (address, options = {}) => {
  const isSSO = getIsSSO(options);
  
  const ssoQuery = useIsLabProviderSSO(address, { ...options, enabled: isSSO && options.enabled !== false });
  const walletQuery = useIsLabProviderWallet(address, { ...options, enabled: !isSSO && options.enabled !== false });
  
  return isSSO ? ssoQuery : walletQuery;
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
