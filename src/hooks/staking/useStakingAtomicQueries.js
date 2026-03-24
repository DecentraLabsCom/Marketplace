/**
 * Atomic React Query Hooks for Staking-related Read Operations
 * Each hook has 3 variants following the standard pattern:
 * - useXSSO: Server-side query via API + Ethers (for SSO users)
 * - useXWallet: Client-side query via Wagmi (for wallet users)
 * - useX: Router that selects SSO or Wallet based on user.loginType
 *
 * Configuration:
 * - staleTime: 5 minutes (300,000ms) — staking data changes infrequently but should be reasonably fresh
 * - gcTime: 30 minutes (1,800,000ms)
 * - refetchOnWindowFocus: true — catch stake changes from external txs
 * - retry: 1
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createSSRSafeQuery } from '@/utils/hooks/ssrSafe'
import { stakingQueryKeys } from '@/utils/hooks/queryKeys'
import { useGetIsWallet } from '@/utils/hooks/authMode'
import useDefaultReadContract from '@/hooks/contract/useDefaultReadContract'
import devLog from '@/utils/dev/logger'

// Staking queries refresh more frequently than lab data since
// stake state can change from provider actions or slashing events
const STAKING_QUERY_CONFIG = {
  staleTime: 5 * 60 * 1000,       // 5 minutes
  gcTime: 30 * 60 * 1000,         // 30 minutes
  refetchOnWindowFocus: true,
  refetchInterval: false,
  refetchOnReconnect: true,
  retry: 1,
}

export { STAKING_QUERY_CONFIG }

const normalizeLabIds = (labIds = []) => {
  if (!Array.isArray(labIds)) return []

  const seen = new Set()
  const normalized = []
  for (const rawId of labIds) {
    if (rawId === null || rawId === undefined || rawId === '') continue
    const asNumber = Number(rawId)
    if (!Number.isFinite(asNumber) || asNumber < 0) continue
    const key = String(asNumber)
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push(asNumber)
  }

  return normalized
}

// ===== useStakeInfo Hook Family =====

const getStakeInfoQueryFn = createSSRSafeQuery(async (provider) => {
  if (!provider) throw new Error('Provider address is required')

  const response = await fetch(`/api/contract/provider/getStakeInfo?provider=${provider}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch stake info: ${response.status}`)
  }

  const data = await response.json()
  devLog.log('🔒 useStakeInfoSSO:', provider, data)
  return data
}, null)

/**
 * Hook for /api/contract/provider/getStakeInfo endpoint (SSO users)
 * @param {string} providerAddress - Provider wallet address
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with stake info
 */
export const useStakeInfoSSO = (providerAddress, options = {}) => {
  return useQuery({
    queryKey: stakingQueryKeys.stakeInfo(providerAddress),
    queryFn: () => getStakeInfoQueryFn(providerAddress),
    enabled: !!providerAddress,
    ...STAKING_QUERY_CONFIG,
    ...options,
  })
}

useStakeInfoSSO.queryFn = getStakeInfoQueryFn

/**
 * Hook for getStakeInfo contract read (Wallet users)
 * @param {string} providerAddress - Provider wallet address
 * @param {Object} [options={}] - Additional wagmi options
 * @returns {Object} Wagmi query result with stake info
 */
export const useStakeInfoWallet = (providerAddress, options = {}) => {
  const result = useDefaultReadContract('getStakeInfo', [providerAddress], {
    enabled: !!providerAddress,
    ...STAKING_QUERY_CONFIG,
    ...options,
  })

  return {
    ...result,
    data: result.data ? {
      stakedAmount: (result.data?.stakedAmount ?? result.data?.[0])?.toString() || '0',
      slashedAmount: (result.data?.slashedAmount ?? result.data?.[1])?.toString() || '0',
      lastReservationTimestamp: Number(result.data?.lastReservationTimestamp ?? result.data?.[2] ?? 0),
      unlockTimestamp: Number(result.data?.unlockTimestamp ?? result.data?.[3] ?? 0),
      canUnstake: Boolean(result.data?.canUnstake ?? result.data?.[4] ?? false),
    } : result.data,
  }
}

/**
 * Hook for getStakeInfo (Router - selects SSO or Wallet)
 * @param {string} providerAddress - Provider wallet address
 * @param {Object} [options={}] - Additional query options
 * @returns {Object} React Query result with stake info
 */
export const useStakeInfo = (providerAddress, options = {}) => {
  const isWallet = useGetIsWallet({ ...options, fallbackDuringInit: false })

  const ssoQuery = useStakeInfoSSO(providerAddress, {
    ...options,
    enabled: !isWallet && options.enabled !== false && !!providerAddress
  })
  const walletQuery = useStakeInfoWallet(providerAddress, {
    ...options,
    enabled: isWallet && options.enabled !== false && !!providerAddress
  })

  devLog.log(`🔀 useStakeInfo → ${isWallet ? 'Wallet' : 'SSO'} mode`)

  return isWallet ? walletQuery : ssoQuery
}

// ===== useRequiredStake Hook Family =====

const getRequiredStakeQueryFn = createSSRSafeQuery(async (provider) => {
  if (!provider) throw new Error('Provider address is required')

  const response = await fetch(`/api/contract/provider/getRequiredStake?provider=${provider}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch required stake: ${response.status}`)
  }

  const data = await response.json()
  devLog.log('🔒 useRequiredStakeSSO:', provider, data)
  return data
}, null)

/**
 * Hook for /api/contract/provider/getRequiredStake endpoint (SSO users)
 * @param {string} providerAddress - Provider wallet address
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with required stake amount
 */
export const useRequiredStakeSSO = (providerAddress, options = {}) => {
  return useQuery({
    queryKey: stakingQueryKeys.requiredStake(providerAddress),
    queryFn: () => getRequiredStakeQueryFn(providerAddress),
    enabled: !!providerAddress,
    ...STAKING_QUERY_CONFIG,
    ...options,
  })
}

useRequiredStakeSSO.queryFn = getRequiredStakeQueryFn

/**
 * Hook for getRequiredStake contract read (Wallet users)
 * @param {string} providerAddress - Provider wallet address
 * @param {Object} [options={}] - Additional wagmi options
 * @returns {Object} Wagmi query result with required stake amount
 */
export const useRequiredStakeWallet = (providerAddress, options = {}) => {
  const result = useDefaultReadContract('getRequiredStake', [providerAddress], {
    enabled: !!providerAddress,
    ...STAKING_QUERY_CONFIG,
    ...options,
  })

  return {
    ...result,
    data: result.data ? {
      requiredStake: result.data?.toString() || '0',
      provider: providerAddress?.toLowerCase()
    } : result.data,
  }
}

/**
 * Hook for getRequiredStake (Router - selects SSO or Wallet)
 * @param {string} providerAddress - Provider wallet address
 * @param {Object} [options={}] - Additional query options
 * @returns {Object} React Query result with required stake amount
 */
export const useRequiredStake = (providerAddress, options = {}) => {
  const isWallet = useGetIsWallet({ ...options, fallbackDuringInit: false })

  const ssoQuery = useRequiredStakeSSO(providerAddress, {
    ...options,
    enabled: !isWallet && options.enabled !== false && !!providerAddress
  })
  const walletQuery = useRequiredStakeWallet(providerAddress, {
    ...options,
    enabled: isWallet && options.enabled !== false && !!providerAddress
  })

  devLog.log(`🔀 useRequiredStake → ${isWallet ? 'Wallet' : 'SSO'} mode`)

  return isWallet ? walletQuery : ssoQuery
}

// ===== useProviderReceivable Hook Family =====

const getProviderReceivableQueryFn = createSSRSafeQuery(async (labId) => {
  if (!labId && labId !== 0) throw new Error('Lab ID is required')

  const response = await fetch(`/api/contract/lab/getProviderReceivable?labId=${labId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch provider receivable: ${response.status}`)
  }

  const data = await response.json()
  devLog.log('💰 useProviderReceivableSSO:', labId, data)
  return data
}, null)

const getProviderReceivablesQueryFn = createSSRSafeQuery(async (labIds = []) => {
  const normalizedLabIds = normalizeLabIds(labIds)
  if (!normalizedLabIds.length) {
    return {
      receivablesByLabId: {},
      items: [],
    }
  }

  const results = await Promise.all(
    normalizedLabIds.map(async (labId) => {
      const receivable = await getProviderReceivableQueryFn(labId)
      return {
        labId,
        receivable,
      }
    })
  )

  const receivablesByLabId = {}
  for (const result of results) {
    receivablesByLabId[String(result.labId)] = result.receivable
  }

  return {
    receivablesByLabId,
    items: results,
  }
}, {
  receivablesByLabId: {},
  items: [],
})

/**
 * Hook for /api/contract/lab/getProviderReceivable endpoint (SSO users)
 * @param {string|number} labId - Lab ID to check
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with provider receivable breakdown
 */
export const useProviderReceivableSSO = (labId, options = {}) => {
  return useQuery({
    queryKey: stakingQueryKeys.providerReceivable(labId),
    queryFn: () => getProviderReceivableQueryFn(labId),
    enabled: labId !== undefined && labId !== null && labId !== '',
    ...STAKING_QUERY_CONFIG,
    ...options,
  })
}

useProviderReceivableSSO.queryFn = getProviderReceivableQueryFn

/**
 * Hook for getLabProviderReceivable contract read (Wallet users)
 * @param {string|number} labId - Lab ID to check
 * @param {Object} [options={}] - Additional wagmi options
 * @returns {Object} Wagmi query result with provider receivable breakdown
 */
export const useProviderReceivableWallet = (labId, options = {}) => {
  const result = useDefaultReadContract('getLabProviderReceivable', [labId], {
    enabled: labId !== undefined && labId !== null && labId !== '',
    ...STAKING_QUERY_CONFIG,
    ...options,
  })

  return {
    ...result,
    data: result.data ? {
      providerReceivable: (result.data?.providerReceivable ?? result.data?.[0])?.toString() || '0',
      deferredInstitutionalReceivable: (result.data?.deferredInstitutionalReceivable ?? result.data?.[1])?.toString() || '0',
      totalReceivable: (result.data?.totalReceivable ?? result.data?.[2])?.toString() || '0',
      eligibleReservationCount: Number(result.data?.eligibleReservationCount ?? result.data?.[3] ?? 0),
    } : result.data,
  }
}

/**
 * Hook for provider receivable status (Router - selects SSO or Wallet)
 * @param {string|number} labId - Lab ID to check
 * @param {Object} [options={}] - Additional query options
 * @returns {Object} React Query result with provider receivable breakdown
 */
export const useProviderReceivable = (labId, options = {}) => {
  const isWallet = useGetIsWallet({ ...options, fallbackDuringInit: false })

  const ssoQuery = useProviderReceivableSSO(labId, {
    ...options,
    enabled: !isWallet && options.enabled !== false && labId !== undefined && labId !== null
  })
  const walletQuery = useProviderReceivableWallet(labId, {
    ...options,
    enabled: isWallet && options.enabled !== false && labId !== undefined && labId !== null
  })

  devLog.log(`🔀 useProviderReceivable → ${isWallet ? 'Wallet' : 'SSO'} mode`)

  return isWallet ? walletQuery : ssoQuery
}

/**
 * Hook for retrieving provider receivables for multiple labs in one query
 * @param {Array<string|number>} labIds - Lab IDs to check
 * @param {Object} [options={}] - Additional query options
 * @returns {Object} React Query result with map + ordered items
 */
export const useProviderReceivables = (labIds = [], options = {}) => {
  const normalizedLabIds = useMemo(() => normalizeLabIds(labIds), [labIds])

  return useQuery({
    queryKey: stakingQueryKeys.providerReceivablesMulti(normalizedLabIds.map(String)),
    queryFn: () => getProviderReceivablesQueryFn(normalizedLabIds),
    enabled: normalizedLabIds.length > 0 && options.enabled !== false,
    ...STAKING_QUERY_CONFIG,
    ...options,
  })
}

useProviderReceivables.queryFn = getProviderReceivablesQueryFn
