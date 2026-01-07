/**
 * User Domain Index - Unified Export for User/Provider-related React Query Hooks
 * 
 * This file serves as the single entry point for all user/provider hooks, following the
 * modular architecture pattern established in the project. Components should import
 * from this file rather than individual hook files to maintain consistency.
 * 
 * Architecture:
 * - Atomic Query Hooks: Three variants (SSO/Wallet/Router) for each query
 * - Atomic Mutation Hooks: Three variants (SSO/Wallet/Router) for each mutation
 * - Composed Query Hooks: Complex orchestration using useQueries (SSO-only)
 * - Cache Update Utilities: Granular cache management
 * - Cache Extraction Helpers: Performance-optimized data extraction
 * 
 * Usage:
 * ```javascript
 * import { useGetLabProviders, useAddProvider, useAllUsersComposed } from '@/hooks/user/useUsers'
 * ```
 */

// ===== ATOMIC QUERY HOOKS =====
// Export all variants (SSO, Wallet, Router) from atomic queries
export * from './useUserAtomicQueries'

// Institution resolution
export { useInstitutionResolve, institutionQueryKeys } from './useInstitutionResolve'

// Onboarding session
export { useOnboardingSession, onboardingSessionQueryKeys } from './useOnboardingSession'

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

// ===== INSTITUTIONAL ONBOARDING =====
export {
  useInstitutionalOnboarding,
  OnboardingState,
} from './useInstitutionalOnboarding'


// Log module loading (only logs once even in StrictMode)
import devLog from '@/utils/dev/logger'
devLog.moduleLoaded('✅ User hooks index loaded - All atomic, composed, and utility hooks available')