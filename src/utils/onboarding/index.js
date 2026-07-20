/**
 * Onboarding utilities barrel export
 * @module utils/onboarding
 */

export {
  resolveInstitutionalBackendUrl,
  hasInstitutionalBackend,
  clearBackendCache,
} from './institutionalBackend'

export {
  OnboardingStatus,
  OnboardingErrorCode,
  extractStableUserId,
} from './institutionalOnboarding'
