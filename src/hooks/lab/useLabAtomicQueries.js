/**
 * Atomic React Query Hooks for Lab-related Read Operations
 * Each hook maps 1:1 to a specific API endpoint in /api/contract/lab/
 * Handles queries (read operations)
 * 
 * Configuration:
 * - staleTime: 12 hours (43,200,000ms)
 * - gcTime: 24 hours (86,400,000ms)
 * - refetchOnWindowFocus: false
 * - refetchInterval: false
 * - refetchOnReconnect: true
 * - retry: 1
 *
 * @author DecentraLabs
 */
import { useQuery } from '@tanstack/react-query'
import { createSSRSafeQuery } from '@/utils/hooks/ssrSafe'
import { labQueryKeys } from '@/utils/hooks/queryKeys'
import devLog from '@/utils/dev/logger'

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
    queryKey: labQueryKeys.getAllLabs(),
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
    queryKey: labQueryKeys.getLab(labId),
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
    queryKey: labQueryKeys.balanceOf(ownerAddress),
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
    queryKey: labQueryKeys.ownerOf(labId),
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
    queryKey: labQueryKeys.tokenOfOwnerByIndex(ownerAddress, index),
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
    queryKey: labQueryKeys.tokenURI(labId),
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

/**
 * Hook for /api/contract/lab/isTokenListed endpoint
 * Checks if a specific lab token is listed in the marketplace
 * @param {string|number} labId - Lab ID to check listing status for
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with listing status
 */
export const useIsTokenListed = (labId, options = {}) => {
  return useQuery({
    queryKey: labQueryKeys.isTokenListed(labId),
    queryFn: createSSRSafeQuery(
      async () => {
        if (!labId) throw new Error('Lab ID is required');
        
        const response = await fetch(`/api/contract/lab/isTokenListed?labId=${labId}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch listing status for lab ${labId}: ${response.status}`);
        }
        
        const data = await response.json();
        devLog.log('🔍 useIsTokenListed:', labId, data);
        return data;
      },
      { isListed: false } // Return false during SSR
    ),
    enabled: !!labId,
    ...LAB_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks
useIsTokenListed.queryFn = async (labId) => {
  if (!labId) throw new Error('Lab ID is required');
  
  const response = await fetch(`/api/contract/lab/isTokenListed?labId=${labId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch listing status for lab ${labId}: ${response.status}`);
  }
  
  const data = await response.json();
  devLog.log('🔍 useIsTokenListed queryFn:', labId, data);
  return data;
};
