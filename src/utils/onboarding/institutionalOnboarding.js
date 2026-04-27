/**
 * Institutional Onboarding — shared constants and helpers.
 *
 * The actual onboarding flow is browser-direct: the React hook
 * (useInstitutionalOnboarding) obtains a short-lived Marketplace JWT via
 * GET /api/onboarding/session, then talks to the Institutional Backend
 * using Authorization: Bearer <jwt>.
 *
 * This module only exports enums and the stable-user-ID extraction logic
 * that the API routes and the hook both need.
 *
 * @module utils/onboarding/institutionalOnboarding
 */

/**
 * Onboarding session status values
 * @readonly
 * @enum {string}
 */
export const OnboardingStatus = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
}

/**
 * Error codes for onboarding failures
 * @readonly
 * @enum {string}
 */
export const OnboardingErrorCode = {
  NO_BACKEND: 'NO_BACKEND_CONFIGURED',
  BACKEND_UNREACHABLE: 'BACKEND_UNREACHABLE',
  INVALID_RESPONSE: 'INVALID_BACKEND_RESPONSE',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  USER_CANCELLED: 'USER_CANCELLED',
  WEBAUTHN_FAILED: 'WEBAUTHN_FAILED',
  MISSING_USER_DATA: 'MISSING_USER_DATA',
}

/**
 * Extracts the stable user identifier from SAML session data.
 * R&S shared identifier:
 * - eduPersonPrincipalName
 * - eduPersonPrincipalName|eduPersonTargetedID
 * 
 * @param {Object} userData - User data from SAML session
 * @returns {string|null} Stable user identifier
 */
export function extractStableUserId(userData) {
  if (!userData) return null

  if (userData.eduPersonPrincipalName) {
    return (userData.eduPersonTargetedID
      ? `${userData.eduPersonPrincipalName}|${userData.eduPersonTargetedID}`
      : userData.eduPersonPrincipalName).trim().toLowerCase()
  }

  if (userData.id && typeof userData.id === 'string') {
    return userData.id.trim().toLowerCase()
  }

  return null
}

export default {
  OnboardingStatus,
  OnboardingErrorCode,
  extractStableUserId,
}
