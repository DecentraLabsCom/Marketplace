/**
 * Atomic React Query Hooks for User/Provider-related API endpoints
 * Each hook maps 1:1 to a specific API endpoint in /api/contract/provider/
 * 
 * Architecture Pattern: Mutations and QueryFn Reuse
 * - Refresh/Validation mutations: Use atomic hook queryFn for consistency
 * - CRUD mutations: Use direct fetch (acceptable for unique operations)  
 * - All query hooks: Export .queryFn for reuse in composed hooks and mutations
 * 
 * Configuration:
 * - staleTime: 2 hours (7,200,000ms)
 * - gcTime: 12 hours (43,200,000ms)
 * - refetchOnWindowFocus: false
 * - refetchInterval: false
 * - refetchOnReconnect: true
 * - retry: 1
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import useContractWriteFunction from '@/hooks/contract/useContractWriteFunction'
import { createSSRSafeQuery } from '@/utils/hooks/ssrSafe'
import { useUser } from '@/context/UserContext'
import { userQueryKeys } from '@/utils/hooks/queryKeys'
import devLog from '@/utils/dev/logger'

// Export composed hooks
export * from './useUsersComposed'

// Common configuration for all user/provider hooks
export const USER_QUERY_CONFIG = {
  staleTime: 2 * 60 * 60 * 1000,   // 2 hours
  gcTime: 12 * 60 * 60 * 1000,     // 12 hours
  refetchOnWindowFocus: false,
  refetchInterval: false,
  refetchOnReconnect: true,
  retry: 1,
}

// ===== QUERY HOOKS =====

/**
 * Hook for /api/contract/provider/getLabProviders endpoint
 * Gets all registered lab providers from the smart contract
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with providers data
 */
export const useLabProviders = (options = {}) => {
  return useQuery({
    queryKey: ['providers', 'getLabProviders'],
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
        devLog.log('🔍 useLabProviders:', data);
        return data;
      },
      [] // Return empty array during SSR
    ),
    ...USER_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks
useLabProviders.queryFn = async () => {
  const response = await fetch('/api/contract/provider/getLabProviders', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch lab providers: ${response.status}`);
  }
  
  const data = await response.json();
  devLog.log('🔍 useLabProviders.queryFn:', data);
  return data;
};

/**
 * Hook for /api/contract/provider/isLabProvider endpoint
 * Checks if an address is a registered lab provider
 * @param {string} address - Address to check
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with provider status
 */
export const useIsLabProvider = (address, options = {}) => {
  return useQuery({
    queryKey: ['providers', 'isLabProvider', address],
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
        devLog.log('🔍 useIsLabProvider:', address, data);
        return data;
      },
      { isProvider: false } // Return false during SSR
    ),
    enabled: !!address,
    ...USER_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks
useIsLabProvider.queryFn = async ({ userAddress }) => {
  if (!userAddress) throw new Error('Address is required');
  
  const response = await fetch(`/api/contract/provider/isLabProvider?wallet=${userAddress}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to check provider status: ${response.status}`);
  }
  
  const data = await response.json();
  devLog.log('🔍 useIsLabProvider.queryFn:', userAddress, data);
  return data;
};

// ===== MUTATION HOOKS =====

/**
 * Hook for wallet-based addProvider using useContractWriteFunction
 * Adds a provider using user's wallet (admin only)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useAddProviderWallet = (options = {}) => {
  const queryClient = useQueryClient();
  const { contractWriteFunction: addProvider } = useContractWriteFunction('addProvider');

  return useMutation({
    mutationFn: async (providerData) => {
      const txHash = await addProvider([providerData.name, providerData.account, providerData.email, providerData.country]);
      
      devLog.log('🔍 useAddProviderWallet - Transaction Hash:', txHash);
      return { hash: txHash };
    },
    onSuccess: (result, variables) => {
      // Invalidate provider queries
      if (variables.account) {
        queryClient.invalidateQueries(['providers', 'isLabProvider', variables.account]);
      }
      queryClient.invalidateQueries(['providers']);
      devLog.log('✅ Provider added successfully via wallet, cache invalidated');
    },
    onError: (error) => {
      devLog.error('❌ Failed to add provider via wallet:', error);
    },
    ...options,
  });
};

/**
 * Hook for /api/contract/provider/addProvider endpoint using server wallet (SSO users)
 * Adds a provider using server wallet for SSO users
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useAddProviderSSO = (options = {}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (providerData) => {
      const response = await fetch('/api/contract/provider/addProvider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(providerData)
      });

      if (!response.ok) {
        throw new Error(`Failed to add provider via SSO: ${response.status}`);
      }

      const data = await response.json();
      devLog.log('🔍 useAddProviderSSO:', data);
      return data;
    },
    onSuccess: (data, variables) => {
      // Invalidate provider queries
      if (variables.account) {
        queryClient.invalidateQueries(['providers', 'isLabProvider', variables.account]);
      }
      queryClient.invalidateQueries(['providers']);
      devLog.log('✅ Provider added successfully via SSO, cache invalidated');
    },
    onError: (error) => {
      devLog.error('❌ Failed to add provider via SSO:', error);
    },
    ...options,
  });
};

/**
 * Unified Hook for adding providers (auto-detects SSO vs Wallet)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useAddProvider = (options = {}) => {
  const { isSSO } = useUser();
  const ssoMutation = useAddProviderSSO(options);
  const walletMutation = useAddProviderWallet(options);

  return useMutation({
    mutationFn: async (providerData) => {
      if (isSSO) {
        return ssoMutation.mutateAsync(providerData);
      } else {
        return walletMutation.mutateAsync(providerData);
      }
    },
    onSuccess: (data, variables) => {
      devLog.log('✅ Provider added successfully via unified hook');
    },
    onError: (error) => {
      devLog.error('❌ Failed to add provider via unified hook:', error);
    },
    ...options,
  });
};

/**
 * Hook for /api/contract/provider/updateProvider endpoint using server wallet (SSO users)
 * Updates a provider using server wallet for SSO users
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useUpdateProviderSSO = (options = {}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updateData) => {
      const response = await fetch('/api/contract/provider/updateProvider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        throw new Error(`Failed to update provider: ${response.status}`);
      }

      const data = await response.json();
      devLog.log('🔍 useUpdateProviderSSO:', data);
      return data;
    },
    onSuccess: (data, variables) => {
      // Invalidate provider queries
      queryClient.invalidateQueries(['providers']);
      devLog.log('✅ Provider updated successfully via SSO, cache invalidated');
    },
    onError: (error) => {
      devLog.error('❌ Failed to update provider via SSO:', error);
    },
    ...options,
  });
};

/**
 * Hook for wallet-based updateProvider using useContractWriteFunction
 * Updates a provider using user's wallet
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useUpdateProviderWallet = (options = {}) => {
  const queryClient = useQueryClient();
  const { contractWriteFunction: updateProvider } = useContractWriteFunction('updateProvider');

  return useMutation({
    mutationFn: async (updateData) => {
      const txHash = await updateProvider([updateData.name, updateData.email, updateData.country]);
      
      devLog.log('🔍 useUpdateProviderWallet - Transaction Hash:', txHash);
      return { hash: txHash };
    },
    onSuccess: (result, variables) => {
      // Invalidate provider queries
      queryClient.invalidateQueries(['providers']);
      devLog.log('✅ Provider updated successfully via wallet, cache invalidated');
    },
    onError: (error) => {
      devLog.error('❌ Failed to update provider via wallet:', error);
    },
    ...options,
  });
};

/**
 * Unified Hook for updating providers (auto-detects SSO vs Wallet)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useUpdateProvider = (options = {}) => {
  const { isSSO } = useUser();
  const ssoMutation = useUpdateProviderSSO(options);
  const walletMutation = useUpdateProviderWallet(options);

  return useMutation({
    mutationFn: async (updateData) => {
      if (isSSO) {
        return ssoMutation.mutateAsync(updateData);
      } else {
        return walletMutation.mutateAsync(updateData);
      }
    },
    onSuccess: (data, variables) => {
      devLog.log('✅ Provider updated successfully via unified hook');
    },
    onError: (error) => {
      devLog.error('❌ Failed to update provider via unified hook:', error);
    },
    ...options,
  });
};

/**
 * Hook for /api/contract/provider/removeProvider endpoint using server wallet (SSO users)
 * Removes a provider using server wallet for SSO users (admin only)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useRemoveProviderSSO = (options = {}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (providerAddress) => {
      const response = await fetch('/api/contract/provider/removeProvider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerAddress })
      });

      if (!response.ok) {
        throw new Error(`Failed to remove provider: ${response.status}`);
      }

      const data = await response.json();
      devLog.log('🔍 useRemoveProviderSSO:', data);
      return data;
    },
    onSuccess: (data, providerAddress) => {
      // Remove provider from cache and invalidate queries
      queryClient.removeQueries(['providers', 'isLabProvider', providerAddress]);
      queryClient.invalidateQueries(['providers']);
      devLog.log('✅ Provider removed successfully via SSO, cache invalidated');
    },
    onError: (error) => {
      devLog.error('❌ Failed to remove provider via SSO:', error);
    },
    ...options,
  });
};

/**
 * Hook for wallet-based removeProvider using useContractWriteFunction
 * Removes a provider using user's wallet (admin only)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useRemoveProviderWallet = (options = {}) => {
  const queryClient = useQueryClient();
  const { contractWriteFunction: removeProvider } = useContractWriteFunction('removeProvider');

  return useMutation({
    mutationFn: async (providerAddress) => {
      const txHash = await removeProvider([providerAddress]);
      
      devLog.log('🔍 useRemoveProviderWallet - Transaction Hash:', txHash);
      return { hash: txHash };
    },
    onSuccess: (result, providerAddress) => {
      // Remove provider from cache and invalidate queries
      queryClient.removeQueries(['providers', 'isLabProvider', providerAddress]);
      queryClient.invalidateQueries(['providers']);
      devLog.log('✅ Provider removed successfully via wallet, cache invalidated');
    },
    onError: (error) => {
      devLog.error('❌ Failed to remove provider via wallet:', error);
    },
    ...options,
  });
};

/**
 * Unified Hook for removing providers (auto-detects SSO vs Wallet)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useRemoveProvider = (options = {}) => {
  const { isSSO } = useUser();
  const ssoMutation = useRemoveProviderSSO(options);
  const walletMutation = useRemoveProviderWallet(options);

  return useMutation({
    mutationFn: async (providerAddress) => {
      if (isSSO) {
        return ssoMutation.mutateAsync(providerAddress);
      } else {
        return walletMutation.mutateAsync(providerAddress);
      }
    },
    onSuccess: (data, providerAddress) => {
      devLog.log('✅ Provider removed successfully via unified hook');
    },
    onError: (error) => {
      devLog.error('❌ Failed to remove provider via unified hook:', error);
    },
    ...options,
  });
};

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

/**
 * Refresh Provider Status Mutation Hook
 * 
 * Architecture Note: This mutation uses the atomic hook's queryFn instead of direct fetch
 * to ensure consistency and follow DRY principles. This pattern should be used when:
 * - The mutation refreshes/validates existing query data
 * - We want to guarantee the same data format and error handling
 * - Maintaining consistency between queries and mutations is critical
 * 
 * For pure write operations (add/update/delete), direct fetch is acceptable.
 * 
 * @param {Object} options - Mutation options
 * @returns {Object} React Query mutation for refreshing provider status
 */
export const useRefreshProviderStatusMutation = (options = {}) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ userAddress, identifier, isEmail = false }) => {
      // Use userAddress if provided directly, otherwise use identifier
      const address = userAddress || identifier;
      if (!address) throw new Error('userAddress or identifier is required');
      
      // ✅ Use the atomic hook's queryFn for consistency and DRY
      const data = await useIsLabProvider.queryFn({ userAddress: address });
      return { 
        isLabProvider: data.isLabProvider,
        isProvider: data.isLabProvider, // Alias for backward compatibility
        address: address
      };
    },
    onSuccess: (result, variables) => {
      const address = result.address;
      // Update cache with new provider status using the correct query key from useIsLabProvider
      queryClient.setQueryData(
        ['providers', 'isLabProvider', address], 
        { isLabProvider: result.isLabProvider, isProvider: result.isLabProvider }
      );
      devLog.log('✅ Provider status refreshed successfully for', address);
    },
    onError: (error, variables) => {
      const address = variables?.userAddress || variables?.identifier;
      devLog.error('❌ Failed to refresh provider status for', address, ':', error.message);
    },
    ...options,
  });
};

// Re-export cache updates utility
export { useUserCacheUpdates } from './useUserCacheUpdates';
