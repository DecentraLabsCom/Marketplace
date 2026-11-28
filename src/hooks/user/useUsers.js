/**
 * User Domain Index - Unified Export for User/Provider-related React Query Hooks
 * 
 * This file serves as the single entry point for all user/provider hooks, following the
 * modular architecture pattern established in the project. Components should import
 * from this file rather than individual hook files to maintain consistency.
 * 
 * Architecture:
 * - Atomic Query Hooks: Institutional/API-backed query variants
 * - Cache Update Utilities: Granular cache management
 * - Cache Extraction Helpers: Performance-optimized data extraction
 * 
 * Usage:
 * ```javascript
 * import { useGetLabProviders, useInstitutionResolve } from '@/hooks/user/useUsers'
 * ```
 */

// ===== ATOMIC QUERY HOOKS =====
export * from './useUserAtomicQueries'

// Institution resolution
export { useInstitutionResolve, institutionQueryKeys } from './useInstitutionResolve'

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
devLog.moduleLoaded('✅ User hooks index loaded - Atomic and utility hooks available')
