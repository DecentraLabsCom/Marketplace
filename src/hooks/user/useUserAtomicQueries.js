/**
 * Atomic React Query Hooks for User/Provider-related queries
 * Each hook maps 1:1 to a specific API endpoint
 * 
 * These hooks are the building blocks for composed hooks and should be used
 * when you need specific data pieces. They export .queryFn for reuse in mutations.
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

// ===== PROVIDER ATOMIC QUERIES =====

/**
 * Hook for /api/contract/provider/getLabProviders endpoint
 * Gets all registered lab providers from the smart contract
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with providers data
 */
export const useGetLabProvidersQuery = (options = {}) => {
  return useQuery({
    queryKey: providerQueryKeys.getLabProviders(),
    queryFn: createSSRSafeQuery(
      async () => {
        const response = await fetch('/api/contract/provider/getLabProviders', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch lab providers: ${response.status}`);
        }
        
        const data = await response.json();
        devLog.log('useGetLabProvidersQuery:', data);
        return data;
      },
      [] // Return empty array during SSR
    ),
    ...USER_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks and mutations
useGetLabProvidersQuery.queryFn = async () => {
  const response = await fetch('/api/contract/provider/getLabProviders', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch lab providers: ${response.status}`);
  }
  
  const data = await response.json();
  devLog.log('useGetLabProvidersQuery.queryFn:', data);
  return data;
};

/**
 * Hook for /api/contract/provider/isLabProvider endpoint
 * Checks if an address is a registered lab provider
 * @param {string} address - Address to check
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with provider status
 */
export const useIsLabProviderQuery = (address, options = {}) => {
  return useQuery({
    queryKey: providerQueryKeys.isLabProvider(address),
    queryFn: createSSRSafeQuery(
      async () => {
        if (!address) throw new Error('Address is required');
        
        const response = await fetch(`/api/contract/provider/isLabProvider?wallet=${address}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to check provider status: ${response.status}`);
        }
        
        const data = await response.json();
        devLog.log('🔍 [useIsLabProviderQuery] ', address, data);
        return data;
      },
      { isProvider: false } // Return false during SSR
    ),
    enabled: !!address,
    ...USER_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks and mutations
useIsLabProviderQuery.queryFn = async ({ userAddress }) => {
  if (!userAddress) throw new Error('Address is required');
  
  const response = await fetch(`/api/contract/provider/isLabProvider?wallet=${userAddress}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to check provider status: ${response.status}`);
  }
  
  const data = await response.json();
  devLog.log('useIsLabProviderQuery.queryFn:', userAddress, data);
  return data;
};

// ===== SSO SESSION QUERIES =====

/**
 * SSO Session Query Hook
 * @param {Object} options - Query options
 * @returns {Object} React Query result for SSO session
 */
export const useSSOSessionQuery = (options = {}) => {
  return useQuery({
    queryKey: userQueryKeys.ssoSession(),
    queryFn: async () => {
      // Placeholder for SSO session logic
      // This would typically check server session or local storage
      return null;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes
    ...options,
  });
};

// Export queryFn for use in composed hooks and mutations
useSSOSessionQuery.queryFn = async () => {
  // Placeholder for SSO session logic
  // This would typically check server session or local storage
  return null;
};

devLog.moduleLoaded('✅ User atomic queries loaded');
