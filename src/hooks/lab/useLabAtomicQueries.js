/**
 * Atomic React Query Hooks for Lab-related Read Operations
 * Each hook has 3 variants following the same pattern as mutations:
 * - useXSSO: Server-side query via API + Ethers (for SSO users)
 *   * Each hook maps 1:1 to a specific API endpoint in /api/contract/lab
 * - useXWallet: Client-side query via Wagmi (for wallet users)
 * - useX: Router that selects SSO or Wallet based on user.loginType
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
import { useGetIsWallet } from '@/utils/hooks/authMode'
import useDefaultReadContract from '@/hooks/contract/useDefaultReadContract'
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

const normalizeLabIds = (ids) => {
  if (!Array.isArray(ids)) return [];
  const seen = new Set();
  const unique = [];
  ids.forEach((id) => {
    const value = typeof id === 'bigint' ? Number(id) : Number(id);
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
 * Hook for getLabsPaginated contract read (Wallet users)
 * Gets first page of lab IDs from the contract directly from blockchain via Wagmi
 * @param {Object} [options={}] - Additional wagmi options
 * @returns {Object} Wagmi query result with all labs data
 */
export const useAllLabsWallet = (options = {}) => {
  const result = useDefaultReadContract('getLabsPaginated', [0, 100], {
      ...LAB_QUERY_CONFIG,
      ...options,
    });

  // Normalize tuple [ids, total] or [total, ids] into ids array for backward compatibility
  const arrayLike = (value) => value && typeof value.length === 'number';
  let rawIds =
    Array.isArray(result.data?.[0]) || arrayLike(result.data?.[0]) ? result.data[0]
    : Array.isArray(result.data?.[1]) || arrayLike(result.data?.[1]) ? result.data[1]
    : Array.isArray(result.data?.ids) || arrayLike(result.data?.ids) ? result.data.ids
    : result.data;

  const normalizedIds = rawIds ? normalizeLabIds(rawIds) : rawIds;

  return {
    ...result,
    data: normalizedIds,
  };
};

/**
 * Hook for getAllLabs (Router - selects SSO or Wallet)
 * Gets all lab IDs from the contract - routes to API or Wagmi based on user type
 * @param {Object} [options={}] - Additional query options
 * @param {boolean} [options.isSSO] - Optional: force SSO or Wallet mode (for use outside UserContext)
 * @returns {Object} React Query result with all labs data
 */
export const useAllLabs = (options = {}) => {
  // Use a safe fallback during initialization to avoid throwing when UserContext
  // is not yet mounted. This prevents an early Wallet-mode selection that would
  // trigger on-chain reads before SSO session is resolved (causing flaky E2E).
  const isWallet = useGetIsWallet({ ...options, fallbackDuringInit: false });
  
  const ssoQuery = useAllLabsSSO({ ...options, enabled: !isWallet && options.enabled !== false });
  const walletQuery = useAllLabsWallet({ ...options, enabled: isWallet && options.enabled !== false });
  
  devLog.log(`🔀 useAllLabs → ${isWallet ? 'Wallet' : 'SSO'} mode`);
  
  return isWallet ? walletQuery : ssoQuery;
};

// ===== useLab Hook Family =====

// Define queryFn first for reuse
const getLabQueryFn = createSSRSafeQuery(async (labId) => {
  if (!labId) throw new Error('Lab ID is required');
  
  const response = await fetch(`/api/contract/lab/getLab?labId=${labId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  
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
 * Hook for getLab contract read (Wallet users)
 * Gets specific lab data by lab ID directly from blockchain via Wagmi
 * @param {string|number} labId - Lab ID to fetch
 * @param {Object} [options={}] - Additional wagmi options
 * @returns {Object} Wagmi query result with lab data normalized to match SSO structure
 */
export const useLabWallet = (labId, options = {}) => {
  return useDefaultReadContract('getLab', [labId], {
    enabled: !!labId,
    select: (data) => selectLabData(data, labId),
    ...LAB_QUERY_CONFIG,
    ...options,
  });
};

/**
 * Hook for getLab (Router - selects SSO or Wallet)
 * Gets specific lab data by lab ID - routes to API or Wagmi based on user type
 * @param {string|number} labId - Lab ID to fetch
 * @param {Object} [options={}] - Additional query options
 * @param {boolean} [options.isSSO] - Optional: force SSO or Wallet mode (for use outside UserContext)
 * @returns {Object} React Query result with lab data
 */
export const useLab = (labId, options = {}) => {
  const isWallet = useGetIsWallet(options);
  
  const ssoQuery = useLabSSO(labId, { ...options, enabled: !isWallet && !!labId });
  const walletQuery = useLabWallet(labId, { ...options, enabled: isWallet && !!labId });
  
  devLog.log(`🔀 useLab [${labId}] → ${isWallet ? 'Wallet' : 'SSO'} mode`);
  
  return isWallet ? walletQuery : ssoQuery;
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
 * Hook for balanceOf contract read (Wallet users)
 * Gets the number of labs owned by an address directly from blockchain via Wagmi
 * @param {string} ownerAddress - Owner address to check
 * @param {Object} [options={}] - Additional wagmi options
 * @returns {Object} Wagmi query result with balance count
 */
export const useLabBalanceWallet = (ownerAddress, options = {}) => {
  return useDefaultReadContract('balanceOf', [ownerAddress], {
      enabled: !!ownerAddress,
      select: selectBalanceData,
      ...LAB_QUERY_CONFIG,
      ...options,
    });
};

/**
 * Hook for balanceOf (Router - selects SSO or Wallet)
 * Gets the number of labs owned by an address - routes to API or Wagmi based on user type
 * @param {string} ownerAddress - Owner address to check
 * @param {Object} [options={}] - Additional query options
 * @param {boolean} [options.isSSO] - Optional: force SSO or Wallet mode (for use outside UserContext)
 * @returns {Object} React Query result with balance count
 */
export const useLabBalance = (ownerAddress, options = {}) => {
  const isWallet = useGetIsWallet(options);
  
  const ssoQuery = useLabBalanceSSO(ownerAddress, { ...options, enabled: !isWallet && !!ownerAddress });
  const walletQuery = useLabBalanceWallet(ownerAddress, { ...options, enabled: isWallet && !!ownerAddress });
  
  devLog.log(`🔀 useLabBalance [${ownerAddress}] → ${isWallet ? 'Wallet' : 'SSO'} mode`);
  
  return isWallet ? walletQuery : ssoQuery;
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

/**
 * Hook for ownerOf contract read (Wallet users)
 * Gets the owner address of a specific lab directly from blockchain via Wagmi
 * @param {string|number} labId - Lab ID to get owner for
 * @param {Object} [options={}] - Additional wagmi options
 * @returns {Object} Wagmi query result with owner address
 */
export const useLabOwnerWallet = (labId, options = {}) => {
  return useDefaultReadContract('ownerOf', [labId], {
      enabled: !!labId,
      select: selectOwnerData,
      ...LAB_QUERY_CONFIG,
      ...options,
    });
};

/**
 * Hook for ownerOf (Router - selects SSO or Wallet)
 * Gets the owner address of a specific lab - routes to API or Wagmi based on user type
 * @param {string|number} labId - Lab ID to get owner for
 * @param {Object} [options={}] - Additional query options
 * @param {boolean} [options.isSSO] - Optional: force SSO or Wallet mode (for use outside UserContext)
 * @returns {Object} React Query result with owner address
 */
export const useLabOwner = (labId, options = {}) => {
  const isWallet = useGetIsWallet(options);
  
  const ssoQuery = useLabOwnerSSO(labId, { ...options, enabled: !isWallet && !!labId });
  const walletQuery = useLabOwnerWallet(labId, { ...options, enabled: isWallet && !!labId });
  
  devLog.log(`🔀 useLabOwner [${labId}] → ${isWallet ? 'Wallet' : 'SSO'} mode`);
  
  return isWallet ? walletQuery : ssoQuery;
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
 * Hook for tokenOfOwnerByIndex contract read (Wallet users)
 * Gets the token ID owned by an address at a specific index directly from blockchain via Wagmi
 * @param {string} ownerAddress - Owner address
 * @param {number} index - Index of the token to get
 * @param {Object} [options={}] - Additional wagmi options
 * @returns {Object} Wagmi query result with token ID
 */
export const useTokenOfOwnerByIndexWallet = (ownerAddress, index, options = {}) => {
  return useDefaultReadContract('tokenOfOwnerByIndex', [ownerAddress, index], {
      enabled: !!ownerAddress && (index !== undefined && index !== null),
      select: selectTokenOfOwnerData,
      ...LAB_QUERY_CONFIG,
      ...options,
    });
};

/**
 * Hook for tokenOfOwnerByIndex (Router - selects SSO or Wallet)
 * Gets the token ID owned by an address at a specific index - routes to API or Wagmi based on user type
 * @param {string} ownerAddress - Owner address
 * @param {number} index - Index of the token to get
 * @param {Object} [options={}] - Additional query options
 * @param {boolean} [options.isSSO] - Optional: force SSO or Wallet mode (for use outside UserContext)
 * @returns {Object} React Query result with token ID
 */
export const useTokenOfOwnerByIndex = (ownerAddress, index, options = {}) => {
  const isWallet = useGetIsWallet(options);
  
  const enabled = !!ownerAddress && (index !== undefined && index !== null);
  const ssoQuery = useTokenOfOwnerByIndexSSO(ownerAddress, index, { ...options, enabled: !isWallet && enabled });
  const walletQuery = useTokenOfOwnerByIndexWallet(ownerAddress, index, { ...options, enabled: isWallet && enabled });
  
  devLog.log(`🔀 useTokenOfOwnerByIndex [${ownerAddress}, ${index}] → ${isWallet ? 'Wallet' : 'SSO'} mode`);
  
  return isWallet ? walletQuery : ssoQuery;
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
 * Hook for tokenURI contract read (Wallet users)
 * Gets the metadata URI for a specific lab token directly from blockchain via Wagmi
 * @param {string|number} labId - Lab ID to get URI for
 * @param {Object} [options={}] - Additional wagmi options
 * @returns {Object} Wagmi query result with token URI
 */
export const useTokenURIWallet = (labId, options = {}) => {
  return useDefaultReadContract('tokenURI', [labId], {
      enabled: !!labId,
      select: selectTokenUriData,
      ...LAB_QUERY_CONFIG,
      ...options,
    });
};

/**
 * Hook for tokenURI (Router - selects SSO or Wallet)
 * Gets the metadata URI for a specific lab token - routes to API or Wagmi based on user type
 * @param {string|number} labId - Lab ID to get URI for
 * @param {Object} [options={}] - Additional query options
 * @param {boolean} [options.isSSO] - Optional: force SSO or Wallet mode (for use outside UserContext)
 * @returns {Object} React Query result with token URI
 */
export const useTokenURI = (labId, options = {}) => {
  const isWallet = useGetIsWallet(options);
  
  const ssoQuery = useTokenURISSO(labId, { ...options, enabled: !isWallet && !!labId });
  const walletQuery = useTokenURIWallet(labId, { ...options, enabled: isWallet && !!labId });
  
  devLog.log(`🔀 useTokenURI [${labId}] → ${isWallet ? 'Wallet' : 'SSO'} mode`);
  
  return isWallet ? walletQuery : ssoQuery;
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
 * Hook for isTokenListed contract read (Wallet users)
 * Checks if a specific lab token is listed in the marketplace directly from blockchain via Wagmi
 * @param {string|number} labId - Lab ID to check listing status for
 * @param {Object} [options={}] - Additional wagmi options
 * @returns {Object} Wagmi query result with listing status
 */
export const useIsTokenListedWallet = (labId, options = {}) => {
  return useDefaultReadContract('isTokenListed', [labId], {
      enabled: !!labId,
      select: selectTokenListedData,
      ...LAB_QUERY_CONFIG,
      ...options,
    });
};

/**
 * Hook for isTokenListed (Router - selects SSO or Wallet)
 * Checks if a specific lab token is listed in the marketplace - routes to API or Wagmi based on user type
 * @param {string|number} labId - Lab ID to check listing status for
 * @param {Object} [options={}] - Additional query options
 * @param {boolean} [options.isSSO] - Optional: force SSO or Wallet mode (for use outside UserContext)
 * @returns {Object} React Query result with listing status
 */
export const useIsTokenListed = (labId, options = {}) => {
  const isWallet = useGetIsWallet(options);
  
  const ssoQuery = useIsTokenListedSSO(labId, { ...options, enabled: !isWallet && !!labId });
  const walletQuery = useIsTokenListedWallet(labId, { ...options, enabled: isWallet && !!labId });
  
  devLog.log(`🔀 useIsTokenListed [${labId}] → ${isWallet ? 'Wallet' : 'SSO'} mode`);
  
  return isWallet ? walletQuery : ssoQuery;
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
 * Hook for getLabReputation contract read (Wallet users)
 * Gets lab reputation data directly from blockchain via Wagmi
 * @param {string|number} labId - Lab ID to fetch reputation for
 * @param {Object} [options={}] - Additional wagmi options
 * @returns {Object} Wagmi query result with reputation data
 */
export const useLabReputationWallet = (labId, options = {}) => {
  return useDefaultReadContract('getLabReputation', [labId], {
    enabled: !!labId,
    select: selectReputationData,
    ...LAB_QUERY_CONFIG,
    ...options,
  });
};

/**
 * Hook for getLabReputation (Router - selects SSO or Wallet)
 * Gets lab reputation data - routes to API or Wagmi based on user type
 * @param {string|number} labId - Lab ID to fetch reputation for
 * @param {Object} [options={}] - Additional query options
 * @param {boolean} [options.isSSO] - Optional: force SSO or Wallet mode
 * @returns {Object} React Query result with reputation data
 */
export const useLabReputation = (labId, options = {}) => {
  const isWallet = useGetIsWallet(options);

  const ssoQuery = useLabReputationSSO(labId, { ...options, enabled: !isWallet && !!labId });
  const walletQuery = useLabReputationWallet(labId, { ...options, enabled: isWallet && !!labId });

  devLog.log(`useLabReputation [${labId}] - ${isWallet ? 'Wallet' : 'SSO'} mode`);

  return isWallet ? walletQuery : ssoQuery;
};
