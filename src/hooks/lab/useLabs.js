/**
 * Atomic React Query Hooks for Lab-related API endpoints
 * Each hook maps 1:1 to a specific API endpoint in /api/contract/lab/
 * 
 * Configuration:
 * - staleTime: 12 hours (43,200,000ms)
 * - gcTime: 24 hours (86,400,000ms)
 * - refetchOnWindowFocus: false
 * - refetchInterval: false
 * - refetchOnReconnect: true
 * - retry: 1
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import useContractWriteFunction from '@/hooks/contract/useContractWriteFunction'
import { createSSRSafeQuery } from '@/utils/hooks/ssrSafe'
import { useUser } from '@/context/UserContext'
import { labQueryKeys } from '@/utils/hooks/queryKeys'
import devLog from '@/utils/dev/logger'

// Export composed hooks
export * from './useLabsComposed'

// Common configuration for all lab hooks
const LAB_QUERY_CONFIG = {
  staleTime: 12 * 60 * 60 * 1000, // 12 hours
  gcTime: 24 * 60 * 60 * 1000,    // 24 hours
  refetchOnWindowFocus: false,
  refetchInterval: false,
  refetchOnReconnect: true,
  retry: 1,
}

// Export configuration for use in composed hooks
export { LAB_QUERY_CONFIG };

/**
 * Hook for /api/contract/lab/getAllLabs endpoint
 * Gets all labs from the smart contract
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with all labs data
 */
export const useAllLabs = (options = {}) => {
  return useQuery({
    queryKey: ['labs', 'getAllLabs'],
    queryFn: createSSRSafeQuery(
      async () => {
        const response = await fetch('/api/contract/lab/getAllLabs', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch all labs: ${response.status}`);
        }
        
        const data = await response.json();
        devLog.log('🔍 useAllLabs:', data);
        return data;
      },
      [] // Return empty array during SSR
    ),
    ...LAB_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks
useAllLabs.queryFn = async () => {
  const response = await fetch('/api/contract/lab/getAllLabs', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch all labs: ${response.status}`);
  }
  
  const data = await response.json();
  devLog.log('🔍 useAllLabs.queryFn:', data);
  return data;
};

/**
 * Hook for /api/contract/lab/getLab endpoint
 * Gets specific lab data by lab ID
 * @param {string|number} labId - Lab ID to fetch
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with lab data
 */
export const useLab = (labId, options = {}) => {
  return useQuery({
    queryKey: ['labs', 'getLab', labId],
    queryFn: createSSRSafeQuery(
      async () => {
        if (!labId) throw new Error('Lab ID is required');
        
        const response = await fetch(`/api/contract/lab/getLab?labId=${labId}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch lab ${labId}: ${response.status}`);
        }
        
        const data = await response.json();
        devLog.log('🔍 useLab:', labId, data);
        return data;
      },
      null // Return null during SSR
    ),
    enabled: !!labId,
    ...LAB_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks
useLab.queryFn = async (labId) => {
  if (!labId) throw new Error('Lab ID is required');
  
  const response = await fetch(`/api/contract/lab/getLab?labId=${labId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch lab ${labId}: ${response.status}`);
  }
  
  const data = await response.json();
  devLog.log('🔍 useLab queryFn:', labId, data);
  return data;
};

/**
 * Hook for /api/contract/lab/balanceOf endpoint
 * Gets the number of labs owned by an address
 * @param {string} ownerAddress - Owner address to check
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with balance count
 */
export const useBalanceOf = (ownerAddress, options = {}) => {
  return useQuery({
    queryKey: ['labs', 'balanceOf', ownerAddress],
    queryFn: createSSRSafeQuery(
      async () => {
        if (!ownerAddress) throw new Error('Owner address is required');
        
        const response = await fetch(`/api/contract/lab/balanceOf?owner=${ownerAddress}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch balance for ${ownerAddress}: ${response.status}`);
        }
        
        const data = await response.json();
        devLog.log('🔍 useBalanceOf:', ownerAddress, data);
        return data;
      },
      { balance: '0' } // Return zero balance during SSR
    ),
    enabled: !!ownerAddress,
    ...LAB_QUERY_CONFIG,
    ...options,
  });
};

/**
 * Hook for /api/contract/lab/ownerOf endpoint
 * Gets the owner address of a specific lab
 * @param {string|number} labId - Lab ID to get owner for
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with owner address
 */
export const useOwnerOf = (labId, options = {}) => {
  return useQuery({
    queryKey: ['labs', 'ownerOf', labId],
    queryFn: createSSRSafeQuery(
      async () => {
        if (!labId) throw new Error('Lab ID is required');
        
        const response = await fetch(`/api/contract/lab/ownerOf?labId=${labId}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch owner of lab ${labId}: ${response.status}`);
        }
        
        const data = await response.json();
        devLog.log('🔍 useOwnerOf:', labId, data);
        return data;
      },
      { owner: null } // Return null owner during SSR
    ),
    enabled: !!labId,
    ...LAB_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks
useOwnerOf.queryFn = async (labId) => {
  if (!labId) throw new Error('Lab ID is required');
  
  const response = await fetch(`/api/contract/lab/ownerOf?labId=${labId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch owner of lab ${labId}: ${response.status}`);
  }
  
  const data = await response.json();
  devLog.log('🔍 useOwnerOf queryFn:', labId, data);
  return data;
};

/**
 * Hook for /api/contract/lab/tokenOfOwnerByIndex endpoint
 * Gets the token ID owned by an address at a specific index
 * @param {string} ownerAddress - Owner address
 * @param {number} index - Index of the token to get
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with token ID
 */
export const useTokenOfOwnerByIndex = (ownerAddress, index, options = {}) => {
  return useQuery({
    queryKey: ['labs', 'tokenOfOwnerByIndex', ownerAddress, index],
    queryFn: createSSRSafeQuery(
      async () => {
        if (!ownerAddress || index === undefined || index === null) {
          throw new Error('Owner address and index are required');
        }
        
        const response = await fetch(`/api/contract/lab/tokenOfOwnerByIndex?owner=${ownerAddress}&index=${index}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch token at index ${index} for ${ownerAddress}: ${response.status}`);
        }
        
        const data = await response.json();
        devLog.log('🔍 useTokenOfOwnerByIndex:', ownerAddress, index, data);
        return data;
      },
      { tokenId: null } // Return null during SSR
    ),
    enabled: !!ownerAddress && (index !== undefined && index !== null),
    ...LAB_QUERY_CONFIG,
    ...options,
  });
};

/**
 * Hook for /api/contract/lab/tokenURI endpoint
 * Gets the metadata URI for a specific lab token
 * @param {string|number} labId - Lab ID to get URI for
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with token URI
 */
export const useTokenURI = (labId, options = {}) => {
  return useQuery({
    queryKey: ['labs', 'tokenURI', labId],
    queryFn: createSSRSafeQuery(
      async () => {
        if (!labId) throw new Error('Lab ID is required');
        
        const response = await fetch(`/api/contract/lab/tokenURI?tokenId=${labId}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch token URI for lab ${labId}: ${response.status}`);
        }
        
        const data = await response.json();
        devLog.log('🔍 useTokenURI:', labId, data);
        return data;
      },
      { uri: '' } // Return empty URI during SSR
    ),
    enabled: !!labId,
    ...LAB_QUERY_CONFIG,
    ...options,
  });
};

// ===== MUTATIONS =====

/**
 * SSO Hook for /api/contract/lab/addLabSSO endpoint
 * Creates a new lab using server wallet (SSO users)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useAddLabSSO = (options = {}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (labData) => {
      const response = await fetch('/api/contract/lab/addLabSSO', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(labData)
      });

      if (!response.ok) {
        throw new Error(`Failed to add lab: ${response.status}`);
      }

      const data = await response.json();
      devLog.log('🔍 useAddLabSSO:', data);
      return data;
    },
    onSuccess: (data) => {
      // Invalidate labs queries
      queryClient.invalidateQueries(['labs']);
      devLog.log('✅ Lab added successfully, cache invalidated');
    },
    onError: (error) => {
      devLog.error('❌ Failed to add lab:', error);
    },
    ...options,
  });
};

/**
 * Wallet Hook for adding labs using wagmi
 * Creates a new lab using user's wallet
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useAddLabWallet = (options = {}) => {
  const queryClient = useQueryClient();
  const { contractWriteFunction: addLab } = useContractWriteFunction('addLab');

  return useMutation({
    mutationFn: async (labData) => {
      const txHash = await addLab([labData.uri, labData.price, labData.auth, labData.accessURI, labData.accessKey]);
      
      devLog.log('🔍 useAddLabWallet - Transaction Hash:', txHash);
      return { hash: txHash };
    },
    onSuccess: (result) => {
      // Invalidate labs queries
      queryClient.invalidateQueries(['labs']);
      devLog.log('✅ Lab added successfully via wallet, cache invalidated');
    },
    onError: (error) => {
      devLog.error('❌ Failed to add lab via wallet:', error);
    },
    ...options,
  });
};

/**
 * Unified Hook for adding labs (auto-detects SSO vs Wallet)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useAddLab = (options = {}) => {
  const { isSSO } = useUser();
  const ssoMutation = useAddLabSSO(options);
  const walletMutation = useAddLabWallet(options);

  return useMutation({
    mutationFn: async (labData) => {
      if (isSSO) {
        return ssoMutation.mutateAsync(labData);
      } else {
        return walletMutation.mutateAsync(labData);
      }
    },
    onSuccess: (data, variables) => {
      devLog.log('✅ Lab added successfully via unified hook');
    },
    onError: (error) => {
      devLog.error('❌ Failed to add lab via unified hook:', error);
    },
    ...options,
  });
};

/**
 * SSO Hook for /api/contract/lab/updateLabSSO endpoint
 * Updates a lab using server wallet (SSO users)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useUpdateLabSSO = (options = {}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updateData) => {
      const response = await fetch('/api/contract/lab/updateLabSSO', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        throw new Error(`Failed to update lab: ${response.status}`);
      }

      const data = await response.json();
      devLog.log('🔍 useUpdateLabSSO:', data);
      return data;
    },
    onSuccess: (data, variables) => {
      // Invalidate specific lab and labs list
      if (variables.labId) {
        queryClient.invalidateQueries(['labs', 'getLab', variables.labId]);
      }
      queryClient.invalidateQueries(['labs']);
      devLog.log('✅ Lab updated successfully, cache invalidated');
    },
    onError: (error) => {
      devLog.error('❌ Failed to update lab:', error);
    },
    ...options,
  });
};

/**
 * Wallet Hook for updating labs using wagmi
 * Updates a lab using user's wallet
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useUpdateLabWallet = (options = {}) => {
  const queryClient = useQueryClient();
  const { contractWriteFunction: updateLab } = useContractWriteFunction('updateLab');

  return useMutation({
    mutationFn: async (updateData) => {
      const txHash = await updateLab([updateData.labId, updateData.uri, updateData.price, updateData.auth, updateData.accessURI, updateData.accessKey]);
      
      devLog.log('🔍 useUpdateLabWallet - Transaction Hash:', txHash);
      return { hash: txHash };
    },
    onSuccess: (result, variables) => {
      // Invalidate specific lab and labs list
      if (variables.labId) {
        queryClient.invalidateQueries(['labs', 'getLab', variables.labId]);
      }
      queryClient.invalidateQueries(['labs']);
      devLog.log('✅ Lab updated successfully via wallet, cache invalidated');
    },
    onError: (error) => {
      devLog.error('❌ Failed to update lab via wallet:', error);
    },
    ...options,
  });
};

/**
 * Unified Hook for updating labs (auto-detects SSO vs Wallet)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useUpdateLab = (options = {}) => {
  const { isSSO } = useUser();
  const ssoMutation = useUpdateLabSSO(options);
  const walletMutation = useUpdateLabWallet(options);

  return useMutation({
    mutationFn: async (updateData) => {
      if (isSSO) {
        return ssoMutation.mutateAsync(updateData);
      } else {
        return walletMutation.mutateAsync(updateData);
      }
    },
    onSuccess: (data, variables) => {
      devLog.log('✅ Lab updated successfully via unified hook');
    },
    onError: (error) => {
      devLog.error('❌ Failed to update lab via unified hook:', error);
    },
    ...options,
  });
};

/**
 * SSO Hook for /api/contract/lab/deleteLabSSO endpoint
 * Deletes a lab using server wallet (SSO users)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useDeleteLabSSO = (options = {}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (labId) => {
      const response = await fetch('/api/contract/lab/deleteLabSSO', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labId })
      });

      if (!response.ok) {
        throw new Error(`Failed to delete lab: ${response.status}`);
      }

      const data = await response.json();
      devLog.log('🔍 useDeleteLabSSO:', data);
      return data;
    },
    onSuccess: (data, labId) => {
      // Remove specific lab and invalidate labs list
      queryClient.removeQueries(['labs', 'getLab', labId]);
      queryClient.invalidateQueries(['labs']);
      devLog.log('✅ Lab deleted successfully, cache updated');
    },
    onError: (error) => {
      devLog.error('❌ Failed to delete lab:', error);
    },
    ...options,
  });
};

/**
 * Wallet Hook for deleting labs using wagmi
 * Deletes a lab using user's wallet
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useDeleteLabWallet = (options = {}) => {
  const queryClient = useQueryClient();
  const { contractWriteFunction: deleteLab } = useContractWriteFunction('deleteLab');

  return useMutation({
    mutationFn: async (labId) => {
      const txHash = await deleteLab([labId]);
      
      devLog.log('🔍 useDeleteLabWallet - Transaction Hash:', txHash);
      return { hash: txHash };
    },
    onSuccess: (result, labId) => {
      // Remove specific lab and invalidate labs list
      queryClient.removeQueries(['labs', 'getLab', labId]);
      queryClient.invalidateQueries(['labs']);
      devLog.log('✅ Lab deleted successfully via wallet, cache updated');
    },
    onError: (error) => {
      devLog.error('❌ Failed to delete lab via wallet:', error);
    },
    ...options,
  });
};

/**
 * Unified Hook for deleting labs (auto-detects SSO vs Wallet)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useDeleteLab = (options = {}) => {
  const { isSSO } = useUser();
  const ssoMutation = useDeleteLabSSO(options);
  const walletMutation = useDeleteLabWallet(options);

  return useMutation({
    mutationFn: async (labId) => {
      if (isSSO) {
        return ssoMutation.mutateAsync(labId);
      } else {
        return walletMutation.mutateAsync(labId);
      }
    },
    onSuccess: (data, labId) => {
      devLog.log('✅ Lab deleted successfully via unified hook');
    },
    onError: (error) => {
      devLog.error('❌ Failed to delete lab via unified hook:', error);
    },
    ...options,
  });
};

/**
 * Hook for /api/contract/lab/setTokenURI endpoint using server wallet (SSO users)
 * Sets token URI using server wallet for SSO users (typically admin/owner only)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useSetTokenURISSO = (options = {}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (uriData) => {
      const response = await fetch('/api/contract/lab/setTokenURI', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(uriData)
      });

      if (!response.ok) {
        throw new Error(`Failed to set token URI: ${response.status}`);
      }

      const data = await response.json();
      devLog.log('🔍 useSetTokenURISSO:', data);
      return data;
    },
    onSuccess: (data, variables) => {
      // Invalidate specific lab's tokenURI and the lab itself
      if (variables.labId) {
        queryClient.invalidateQueries(['labs', 'tokenURI', variables.labId]);
        queryClient.invalidateQueries(['labs', 'getLab', variables.labId]);
      }
      devLog.log('✅ Token URI set successfully via SSO, cache invalidated');
    },
    onError: (error) => {
      devLog.error('❌ Failed to set token URI via SSO:', error);
    },
    ...options,
  });
};

/**
 * Hook for wallet-based setTokenURI using useContractWriteFunction
 * Sets token URI using user's wallet (typically admin/owner only)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useSetTokenURIWallet = (options = {}) => {
  const queryClient = useQueryClient();
  const { contractWriteFunction: setTokenURI } = useContractWriteFunction('setTokenURI');

  return useMutation({
    mutationFn: async (uriData) => {
      const txHash = await setTokenURI([uriData.labId, uriData.tokenURI]);
      
      devLog.log('🔍 useSetTokenURIWallet - Transaction Hash:', txHash);
      return { hash: txHash };
    },
    onSuccess: (result, variables) => {
      // Invalidate specific lab's tokenURI and the lab itself
      if (variables.labId) {
        queryClient.invalidateQueries(['labs', 'tokenURI', variables.labId]);
        queryClient.invalidateQueries(['labs', 'getLab', variables.labId]);
      }
      devLog.log('✅ Token URI set successfully via wallet, cache invalidated');
    },
    onError: (error) => {
      devLog.error('❌ Failed to set token URI via wallet:', error);
    },
    ...options,
  });
};

/**
 * Unified Hook for setting token URI (auto-detects SSO vs Wallet)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useSetTokenURI = (options = {}) => {
  const { isSSO } = useUser();
  const ssoMutation = useSetTokenURISSO(options);
  const walletMutation = useSetTokenURIWallet(options);

  return useMutation({
    mutationFn: async (uriData) => {
      if (isSSO) {
        return ssoMutation.mutateAsync(uriData);
      } else {
        return walletMutation.mutateAsync(uriData);
      }
    },
    onSuccess: (data, variables) => {
      devLog.log('✅ Token URI set successfully via unified hook');
    },
    onError: (error) => {
      devLog.error('❌ Failed to set token URI via unified hook:', error);
    },
    ...options,
  });
};

/**
 * Create Lab Mutation Hook
 * @param {Object} options - Mutation options
 * @returns {Object} React Query mutation for creating labs
 */
export const useCreateLabMutation = (options = {}) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (labData) => {
      const response = await fetch('/api/contract/lab/createLab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(labData),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create lab');
      }
      
      return response.json();
    },
    onSuccess: (data, variables) => {
      // Invalidate lab queries
      queryClient.invalidateQueries({ queryKey: labQueryKeys.all() });
      devLog.log('✅ Lab created successfully');
    },
    onError: (error) => {
      devLog.error('❌ Failed to create lab:', error);
    },
    ...options,
  });
};

/**
 * Toggle Lab Status Mutation Hook
 * @param {Object} options - Mutation options
 * @returns {Object} React Query mutation for toggling lab status
 */
export const useToggleLabStatusMutation = (options = {}) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ labId, isActive }) => {
      const response = await fetch('/api/contract/lab/toggleLabStatus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labId, isActive }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to toggle lab status');
      }
      
      return response.json();
    },
    onSuccess: (data, variables) => {
      // Invalidate lab queries
      queryClient.invalidateQueries({ queryKey: labQueryKeys.all() });
      queryClient.invalidateQueries({ queryKey: labQueryKeys.byId(variables.labId) });
      devLog.log('✅ Lab status toggled successfully');
    },
    onError: (error) => {
      devLog.error('❌ Failed to toggle lab status:', error);
    },
    ...options,
  });
};

/**
 * Claim All Balance Mutation Hook
 * @param {Object} options - Mutation options
 * @returns {Object} React Query mutation for claiming all balance
 */
export const useClaimAllBalanceMutation = (options = {}) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/contract/reservation/claimAllBalance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to claim all balance');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      // Invalidate balance queries
      queryClient.invalidateQueries({ queryKey: ['reservations', 'getSafeBalance'] });
      devLog.log('✅ All balance claimed successfully');
    },
    onError: (error) => {
      devLog.error('❌ Failed to claim all balance:', error);
    },
    ...options,
  });
};

/**
 * Claim Lab Balance Mutation Hook
 * @param {Object} options - Mutation options
 * @returns {Object} React Query mutation for claiming lab balance
 */
export const useClaimLabBalanceMutation = (options = {}) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (labId) => {
      const response = await fetch('/api/contract/reservation/claimLabBalance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labId }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to claim lab balance');
      }
      
      return response.json();
    },
    onSuccess: (data, labId) => {
      // Invalidate balance queries
      queryClient.invalidateQueries({ queryKey: ['reservations', 'getSafeBalance'] });
      queryClient.invalidateQueries({ queryKey: labQueryKeys.byId(labId) });
      devLog.log('✅ Lab balance claimed successfully');
    },
    onError: (error) => {
      devLog.error('❌ Failed to claim lab balance:', error);
    },
    ...options,
  });
};

// Re-export cache updates utility
export { useLabCacheUpdates } from './useLabCacheUpdates';