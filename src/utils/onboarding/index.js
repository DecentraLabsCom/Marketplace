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
  initiateInstitutionalOnboarding,
  checkOnboardingStatus,
  pollOnboardingStatus,
  checkUserOnboardingStatus,
} from './institutionalOnboarding'
export {
  storeOnboardingResult,
  getOnboardingResult,
  findResultByUser,
  clearOnboardingResult,
  clearUserResults,
  getStoreStats,
} from './onboardingResultStore'
