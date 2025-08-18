/**
 * User Domain Index - Unified Export for User/Provider-related React Query Hooks
 * 
 * This file serves as the single entry point for all user/provider hooks, following the
 * modular architecture pattern established in the project. Components should import
 * from this file rather than individual hook files to maintain consistency.
 * 
 * Architecture:
 * - Atomic Query Hooks: Single useQuery calls (1:1 with API endpoints)
 * - Atomic Mutation Hooks: Single mutations with Wallet/SSO/Router variants
 * - Composed Query Hooks: Complex orchestration using useQueries
 * - Cache Update Utilities: Granular cache management
 * - Cache Extraction Helpers: Performance-optimized data extraction
 * 
 * Usage:
 * ```javascript
 * import { useGetLabProvidersQuery, useAddProvider, useAllUsersComposed } from '@/hooks/user/useUsers'
 * ```
 */

// ===== ATOMIC QUERY HOOKS =====
export {
  useGetLabProvidersQuery,
  useIsLabProviderQuery,
  useSSOSessionQuery,
  USER_QUERY_CONFIG,
} from './useUserAtomicQueries'

// ===== ATOMIC MUTATION HOOKS =====
export {
  // Provider Mutations - Wallet variants
  useAddProviderWallet,
  useUpdateProviderWallet,
  useRemoveProviderWallet,
  
  // Provider Mutations - SSO variants
  useAddProviderSSO,
  useUpdateProviderSSO,
  useRemoveProviderSSO,
  
  // Provider Mutations - Router variants (auto-detect SSO vs Wallet)
  useAddProvider,
  useUpdateProvider,
  useRemoveProvider,
  
  // Refresh/Validation Mutations
  useRefreshProviderStatusMutation,
} from './useUserAtomicMutations'

// ===== COMPOSED QUERY HOOKS =====
export {
  useProvidersWithNames,
  useBatchProviderCheck,
  useProviderDetails,
  useAllUsersComposed,
  useProviderStatusComposed,
  useAllUsersBasic,
  useAllUsersFull,
  
  // Cache Extraction Helpers
  extractProviderFromComposed,
  isProviderFromComposed,
  getProviderNameFromComposed,
} from './useUserComposedQueries'

// ===== CACHE UPDATE UTILITIES =====
export {
  useUserCacheUpdates,
} from './useUserCacheUpdates'

// ===== BACKWARD COMPATIBILITY ALIASES =====
// These aliases maintain compatibility with existing code while encouraging
// migration to the new atomic hook naming convention

/**
 * @deprecated Use useGetLabProvidersQuery instead
 */
export const useLabProviders = useGetLabProvidersQuery

/**
 * @deprecated Use useIsLabProviderQuery instead  
 */
export const useIsLabProvider = useIsLabProviderQuery

// Import the actual hooks to create the aliases
import { 
  useGetLabProvidersQuery,
  useIsLabProviderQuery,
} from './useUserAtomicQueries'

// Log module loading (only logs once even in StrictMode)
import devLog from '@/utils/dev/logger'
devLog.moduleLoaded('✅ User hooks index loaded - All atomic, composed, and utility hooks available')