/**
 * Atomic React Query Hooks for Lab-related Read Operations.
 * Marketplace runtime uses institutional/API-backed variants only.
 * 
 * Configuration:
 * - staleTime: 12 hours (43,200,000ms)
 * - gcTime: 24 hours (86,400,000ms)
 * - refetchOnWindowFocus: false
 * - refetchInterval: false
 * - refetchOnReconnect: true
 * - retry: 1
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query'
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
  placeholderData: keepPreviousData,
}

// Export configuration for use in composed hooks
export { LAB_QUERY_CONFIG };

const extractLabIdValue = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') {
    return value.labId ?? value.id ?? value.tokenId ?? null;
  }
  return value;
};

const normalizeLabIds = (ids) => {
  if (!Array.isArray(ids)) return [];
  const seen = new Set();
  const unique = [];
  ids.forEach((id) => {
    const rawId = extractLabIdValue(id);
    const value = typeof rawId === 'bigint' ? Number(rawId) : Number(rawId);
    if (!Number.isFinite(value)) return;
    if (seen.has(value)) return;
    seen.add(value);
    unique.push(value);
  });
  return unique;
};

const normalizeBigIntToString = (value, fallback = '0') => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') return value;
  return fallback;
};

const normalizeNumber = (value, fallback = 0) => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'bigint') return Number(value);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const selectLabData = (data, labId) => {
  if (!data) return null;
  const base = data.base || data[1] || {};
  const price = normalizeBigIntToString(base.price, '0');

  return {
    labId: normalizeNumber(data.labId ?? data[0] ?? labId),
    base: {
      uri: String(base.uri || ''),
      price,
      priceNumber: normalizeNumber(price, 0),
      accessURI: String(base.accessURI || ''),
      accessKey: String(base.accessKey || ''),
      createdAt: normalizeNumber(base.createdAt, 0),
    }
  };
};

const selectBalanceData = (data) => ({
  balance: normalizeBigIntToString(data?.balance ?? data, '0')
});

const selectOwnerData = (data) => ({
  owner: data?.owner ?? data ?? null
});

const selectCreatorPucHashData = (data) => ({
  creatorPucHash: data?.creatorPucHash ?? data ?? null
});

const selectTokenOfOwnerData = (data) => {
  const tokenId = data?.tokenId ?? data;
  return {
    tokenId: tokenId === null || tokenId === undefined ? null : normalizeBigIntToString(tokenId)
  };
};

const selectTokenUriData = (data) => ({
  uri: String(data?.uri ?? data ?? '')
});

const selectTokenListedData = (data) => ({
  isListed: Boolean(data?.isListed ?? data)
});

const selectReputationData = (data) => {
  if (!data) return null;
  return {
    score: normalizeNumber(data.score ?? data[0]),
    totalEvents: normalizeNumber(data.totalEvents ?? data[1]),
    ownerCancellations: normalizeNumber(data.ownerCancellations ?? data[2]),
    institutionalCancellations: normalizeNumber(data.institutionalCancellations ?? data[3]),
    lastUpdated: normalizeNumber(data.lastUpdated ?? data[4]),
  };
};

// ===== useAllLabs Hook Family =====

// Define queryFn first for reuse
const getAllLabsQueryFn = createSSRSafeQuery(async () => {
  const response = await fetch('/api/contract/lab/getAllLabs', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch all labs: ${response.status}`);
  }
  
  const data = await response.json();
  const normalized = normalizeLabIds(data);
  devLog.log('🔍 useAllLabsSSO:', normalized);
  return normalized;
}, []); // Return empty array during SSR

/**
 * Hook for /api/contract/lab/getAllLabs endpoint (SSO users)
 * Gets all lab IDs from the contract via API + Ethers
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with all labs data
 */
export const useAllLabsSSO = (options = {}) => {
  return useQuery({
    queryKey: labQueryKeys.getAllLabs(),
    queryFn: getAllLabsQueryFn,
    select: (data) => normalizeLabIds(data),
    ...LAB_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks
useAllLabsSSO.queryFn = getAllLabsQueryFn;

/**
 * Hook for lab-id reads in the institutional runtime.
 * @param {Object} [options={}] - Additional query options
 * @returns {Object} React Query result with all labs data
 */
export const useAllLabs = (options = {}) => {
  return useAllLabsSSO({
    ...options,
    enabled: options.enabled !== false,
  });
};

// ===== useLab Hook Family =====

// Define queryFn first for reuse
const getLabQueryFn = createSSRSafeQuery(async (labId) => {
  if (!labId) throw new Error('Lab ID is required');
  
  const response = await fetch(`/api/contract/lab/getLab?labId=${labId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });

  if (response.status === 404) {
    devLog.warn(`🧹 useLabSSO: lab ${labId} no longer exists on-chain`);
    return null;
  }
  
  if (!response.ok) {
    throw new Error(`Failed to fetch lab ${labId}: ${response.status}`);
  }
  
  const data = await response.json();
  devLog.log('🔍 useLabSSO:', labId, data);
  return data;
}, null); // Return null during SSR

/**
 * Hook for /api/contract/lab/getLab endpoint (SSO users)
 * Gets specific lab data by lab ID via API + Ethers
 * @param {string|number} labId - Lab ID to fetch
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with lab data
 */
export const useLabSSO = (labId, options = {}) => {
  return useQuery({
    queryKey: labQueryKeys.getLab(labId),
    queryFn: () => getLabQueryFn(labId),
    enabled: !!labId,
    select: (data) => selectLabData(data, labId),
    ...LAB_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks
useLabSSO.queryFn = getLabQueryFn;

/**
 * Hook for lab-detail reads in the institutional runtime.
 * @param {string|number} labId - Lab ID to fetch
 * @param {Object} [options={}] - Additional query options
 * @returns {Object} React Query result with lab data
 */
export const useLab = (labId, options = {}) => {
  return useLabSSO(labId, {
    ...options,
    enabled: !!labId && options.enabled !== false,
  });
};

// ===== useLabBalance Hook Family (renamed from useBalanceOf for clarity) =====

// Define queryFn first for reuse
const getBalanceOfQueryFn = createSSRSafeQuery(async (ownerAddress) => {
  if (!ownerAddress) throw new Error('Owner address is required');
  
  const response = await fetch(`/api/contract/lab/balanceOf?owner=${ownerAddress}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch balance for ${ownerAddress}: ${response.status}`);
  }
  
  const data = await response.json();
  devLog.log('🔍 useLabBalanceSSO:', ownerAddress, data);
  return data;
}, { balance: '0' }); // Return '0' during SSR

/**
 * Hook for /api/contract/lab/balanceOf endpoint (SSO users)
 * Gets the number of labs owned by an address via API + Ethers
 * @param {string} ownerAddress - Owner address to check
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with balance count
 */
export const useLabBalanceSSO = (ownerAddress, options = {}) => {
  return useQuery({
    queryKey: labQueryKeys.balanceOf(ownerAddress),
    queryFn: () => getBalanceOfQueryFn(ownerAddress),
    enabled: !!ownerAddress,
    select: selectBalanceData,
    ...LAB_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks
useLabBalanceSSO.queryFn = getBalanceOfQueryFn;

/**
 * Hook for owned-lab-count reads in the institutional runtime.
 * @param {string} ownerAddress - Owner address to check
 * @param {Object} [options={}] - Additional query options
 * @returns {Object} React Query result with balance count
 */
export const useLabBalance = (ownerAddress, options = {}) => {
  return useLabBalanceSSO(ownerAddress, {
    ...options,
    enabled: !!ownerAddress && options.enabled !== false,
  });
};

// ===== useLabOwner Hook Family (renamed from useOwnerOf for clarity) =====

// Define queryFn first for reuse
const getOwnerOfQueryFn = createSSRSafeQuery(async (labId) => {
  if (!labId) throw new Error('Lab ID is required');
  
  const response = await fetch(`/api/contract/lab/ownerOf?labId=${labId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch owner of lab ${labId}: ${response.status}`);
  }
  
  const data = await response.json();
  devLog.log('🔍 useLabOwnerSSO:', labId, data);
  return data;
}, { owner: null }); // Return null during SSR

/**
 * Hook for /api/contract/lab/ownerOf endpoint (SSO users)
 * Gets the owner address of a specific lab via API + Ethers
 * @param {string|number} labId - Lab ID to get owner for
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with owner address
 */
export const useLabOwnerSSO = (labId, options = {}) => {
  return useQuery({
    queryKey: labQueryKeys.ownerOf(labId),
    queryFn: () => getOwnerOfQueryFn(labId),
    enabled: !!labId,
    select: selectOwnerData,
    ...LAB_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks
useLabOwnerSSO.queryFn = getOwnerOfQueryFn;

// ===== useLabCreatorPucHash Hook Family =====

const getCreatorPucHashQueryFn = createSSRSafeQuery(async (labId) => {
  if (!labId) throw new Error('Lab ID is required');

  const response = await fetch(`/api/contract/lab/getCreatorPucHash?labId=${labId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch creator hash for lab ${labId}: ${response.status}`);
  }

  const data = await response.json();
  devLog.log('useLabCreatorPucHashSSO:', labId, data);
  return data;
}, { creatorPucHash: null });

export const useLabCreatorPucHashSSO = (labId, options = {}) => {
  return useQuery({
    queryKey: labQueryKeys.getCreatorPucHash(labId),
    queryFn: () => getCreatorPucHashQueryFn(labId),
    enabled: !!labId,
    select: selectCreatorPucHashData,
    ...LAB_QUERY_CONFIG,
    ...options,
  });
};

useLabCreatorPucHashSSO.queryFn = getCreatorPucHashQueryFn;

/**
 * Hook for lab-owner reads in the institutional runtime.
 * @param {string|number} labId - Lab ID to get owner for
 * @param {Object} [options={}] - Additional query options
 * @returns {Object} React Query result with owner address
 */
export const useLabOwner = (labId, options = {}) => {
  return useLabOwnerSSO(labId, {
    ...options,
    enabled: !!labId && options.enabled !== false,
  });
};

// ===== useTokenOfOwnerByIndex Hook Family =====

// Define queryFn first for reuse
const getTokenOfOwnerByIndexQueryFn = createSSRSafeQuery(async (ownerAddress, index) => {
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
  devLog.log('🔍 useTokenOfOwnerByIndexSSO:', ownerAddress, index, data);
  return data;
}, { tokenId: null }); // Return null during SSR

/**
 * Hook for /api/contract/lab/tokenOfOwnerByIndex endpoint (SSO users)
 * Gets the token ID owned by an address at a specific index via API + Ethers
 * @param {string} ownerAddress - Owner address
 * @param {number} index - Index of the token to get
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with token ID
 */
export const useTokenOfOwnerByIndexSSO = (ownerAddress, index, options = {}) => {
  return useQuery({
    queryKey: labQueryKeys.tokenOfOwnerByIndex(ownerAddress, index),
    queryFn: () => getTokenOfOwnerByIndexQueryFn(ownerAddress, index),
    enabled: !!ownerAddress && (index !== undefined && index !== null),
    select: selectTokenOfOwnerData,
    ...LAB_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks
useTokenOfOwnerByIndexSSO.queryFn = getTokenOfOwnerByIndexQueryFn;

/**
 * Hook for owner-token-index reads in the institutional runtime.
 * @param {string} ownerAddress - Owner address
 * @param {number} index - Index of the token to get
 * @param {Object} [options={}] - Additional query options
 * @returns {Object} React Query result with token ID
 */
export const useTokenOfOwnerByIndex = (ownerAddress, index, options = {}) => {
  const enabled = !!ownerAddress && (index !== undefined && index !== null);
  return useTokenOfOwnerByIndexSSO(ownerAddress, index, {
    ...options,
    enabled: enabled && options.enabled !== false,
  });
};

// ===== useTokenURI Hook Family =====

// Define queryFn first for reuse
const getTokenURIQueryFn = createSSRSafeQuery(async (labId) => {
  if (!labId) throw new Error('Lab ID is required');
  
  const response = await fetch(`/api/contract/lab/tokenURI?tokenId=${labId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch token URI for lab ${labId}: ${response.status}`);
  }
  
  const data = await response.json();
  devLog.log('🔍 useTokenURISSO:', labId, data);
  return data;
}, { uri: '' }); // Return empty string during SSR

/**
 * Hook for /api/contract/lab/tokenURI endpoint (SSO users)
 * Gets the metadata URI for a specific lab token via API + Ethers
 * @param {string|number} labId - Lab ID to get URI for
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with token URI
 */
export const useTokenURISSO = (labId, options = {}) => {
  return useQuery({
    queryKey: labQueryKeys.tokenURI(labId),
    queryFn: () => getTokenURIQueryFn(labId),
    enabled: !!labId,
    select: selectTokenUriData,
    ...LAB_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks
useTokenURISSO.queryFn = getTokenURIQueryFn;

/**
 * Hook for lab metadata URI reads in the institutional runtime.
 * @param {string|number} labId - Lab ID to get URI for
 * @param {Object} [options={}] - Additional query options
 * @returns {Object} React Query result with token URI
 */
export const useTokenURI = (labId, options = {}) => {
  return useTokenURISSO(labId, {
    ...options,
    enabled: !!labId && options.enabled !== false,
  });
};

// ===== useIsTokenListed Hook Family =====

// Define queryFn first for reuse
const getIsTokenListedQueryFn = createSSRSafeQuery(async (labId) => {
  if (!labId) throw new Error('Lab ID is required');
  
  const response = await fetch(`/api/contract/reservation/isTokenListed?labId=${labId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
  });

  if (response.status === 404) {
    devLog.warn(`🧹 useIsTokenListedSSO: lab ${labId} no longer exists on-chain`);
    return { isListed: false, notFound: true };
  }
  
  if (!response.ok) {
    throw new Error(`Failed to fetch listing status for lab ${labId}: ${response.status}`);
  }
  
  const data = await response.json();
  devLog.log('🔍 useIsTokenListedSSO:', labId, data);
  return data;
}, { isListed: false }); // Return false during SSR

/**
 * Hook for /api/contract/reservation/isTokenListed endpoint (SSO users)
 * Checks if a specific lab token is listed in the marketplace via API + Ethers
 * @param {string|number} labId - Lab ID to check listing status for
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with listing status
 */
export const useIsTokenListedSSO = (labId, options = {}) => {
  return useQuery({
    queryKey: labQueryKeys.isTokenListed(labId),
    queryFn: () => getIsTokenListedQueryFn(labId),
    enabled: !!labId,
    select: selectTokenListedData,
    ...LAB_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks
useIsTokenListedSSO.queryFn = getIsTokenListedQueryFn;

/**
 * Hook for listing-status reads in the institutional runtime.
 * @param {string|number} labId - Lab ID to check listing status for
 * @param {Object} [options={}] - Additional query options
 * @returns {Object} React Query result with listing status
 */
export const useIsTokenListed = (labId, options = {}) => {
  return useIsTokenListedSSO(labId, {
    ...options,
    enabled: !!labId && options.enabled !== false,
  });
};

// ===== useLabReputation Hook Family =====

const getLabReputationQueryFn = createSSRSafeQuery(async (labId) => {
  if (!labId) throw new Error('Lab ID is required');

  const response = await fetch(`/api/contract/lab/getLabReputation?labId=${labId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch lab reputation ${labId}: ${response.status}`);
  }

  const data = await response.json();
  devLog.log('useLabReputationSSO:', labId, data);
  return data;
}, null);

/**
 * Hook for /api/contract/lab/getLabReputation endpoint (SSO users)
 * Gets lab reputation data via API + Ethers
 * @param {string|number} labId - Lab ID to fetch reputation for
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with reputation data
 */
export const useLabReputationSSO = (labId, options = {}) => {
  return useQuery({
    queryKey: labQueryKeys.getLabReputation(labId),
    queryFn: () => getLabReputationQueryFn(labId),
    enabled: !!labId,
    select: selectReputationData,
    ...LAB_QUERY_CONFIG,
    ...options,
  });
};

useLabReputationSSO.queryFn = getLabReputationQueryFn;

/**
 * Hook for lab-reputation reads in the institutional runtime.
 * @param {string|number} labId - Lab ID to fetch reputation for
 * @param {Object} [options={}] - Additional query options
 * @returns {Object} React Query result with reputation data
 */
export const useLabReputation = (labId, options = {}) => {
  return useLabReputationSSO(labId, {
    ...options,
    enabled: !!labId && options.enabled !== false,
  });
};


