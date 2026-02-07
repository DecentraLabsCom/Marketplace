/**
 * Institutional Onboarding Service
 * 
 * Handles the WebAuthn credential registration ceremony with the Institutional Backend (IB).
 * This establishes a cryptographic binding between the federated user identifier (from SAML)
 * and a user-specific signing public key, which is later used to verify user consent
 * for blockchain transactions.
 * 
 * Flow:
 * 1. SP (Marketplace) calls IB's POST /onboarding/webauthn/options with user data
 * 2. IB returns sessionId and ceremonyUrl
 * 3. SP redirects browser to ceremonyUrl for WebAuthn registration
 * 4. User completes WebAuthn ceremony in browser (handled by IB's page)
 * 5. IB calls SP's callback endpoint with result (or SP polls status)
 * 
 * @module utils/onboarding/institutionalOnboarding
 */

import devLog from '@/utils/dev/logger'
import { resolveInstitutionalBackendUrl } from './institutionalBackend'
import { computeAssertionHash } from '@/utils/intents/signInstitutionalActionIntent'

const getSpApiKey = () => process.env.INSTITUTION_BACKEND_SP_API_KEY || null

const buildSpAuthHeaders = () => {
  const apiKey = getSpApiKey()
  const requireKey = String(process.env.INSTITUTIONAL_REQUIRE_SP_API_KEY || '').toLowerCase() === 'true'

  if (!apiKey) {
    if (requireKey) {
      throw new Error('Missing SP API key for institutional backend (INSTITUTION_BACKEND_SP_API_KEY)')
    }
    return {}
  }

  return {
    'X-SP-Api-Key': apiKey,
  }
}

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
 * Priority: schacPersonalUniqueCode > eduPersonPrincipalName > uid@affiliation
 * 
 * @param {Object} userData - User data from SAML session
 * @returns {string|null} Stable user identifier
 */
export function extractStableUserId(userData) {
  if (!userData) return null
  
  // Priority 1: schacPersonalUniqueCode (most stable across institutions)
  if (userData.personalUniqueCode || userData.schacPersonalUniqueCode) {
    return userData.personalUniqueCode || userData.schacPersonalUniqueCode
  }
  
  // Priority 2: eduPersonPrincipalName (scoped identifier)
  if (userData.scopedRole) {
    return userData.scopedRole
  }
  
  // Priority 3: Construct from uid + affiliation
  if (userData.id && userData.affiliation) {
    return `${userData.id}@${userData.affiliation}`
  }
  
  // Fallback: email (less stable but widely available)
  return userData.email || null
}

/**
 * Initiates the institutional onboarding process.
 * Calls the IB to get WebAuthn options and ceremony URL.
 * 
 * @param {Object} params - Onboarding parameters
 * @param {Object} params.userData - User data from SAML session
 * @param {string} params.userData.id - User identifier
 * @param {string} params.userData.email - User email
 * @param {string} params.userData.name - User display name
 * @param {string} params.userData.affiliation - Institution domain (schacHomeOrganization)
 * @param {string} params.userData.samlAssertion - Base64 SAML assertion
 * @param {string} params.callbackUrl - URL for IB to POST onboarding result
 * @returns {Promise<Object>} Onboarding session with sessionId and ceremonyUrl
 * @throws {Error} If onboarding initiation fails
 */
export async function initiateInstitutionalOnboarding({ userData, callbackUrl }) {
  if (!userData) {
    throw new Error(OnboardingErrorCode.MISSING_USER_DATA)
  }

  const institutionId = userData.affiliation
  if (!institutionId) {
    throw new Error(`${OnboardingErrorCode.MISSING_USER_DATA}: Missing institution affiliation`)
  }

  const backendUrl = await resolveInstitutionalBackendUrl(institutionId)
  if (!backendUrl) {
    throw new Error(`${OnboardingErrorCode.NO_BACKEND}: No backend configured for ${institutionId}`)
  }

  const stableUserId = extractStableUserId(userData)
  if (!stableUserId) {
    throw new Error(`${OnboardingErrorCode.MISSING_USER_DATA}: Cannot determine stable user ID`)
  }

  devLog.log('[InstitutionalOnboarding] Initiating onboarding for', stableUserId, 'at', institutionId)

  // Build request payload for IB
  const requestPayload = {
    stableUserId,
    institutionId,
    displayName: userData.name || userData.email || stableUserId,
    attributes: JSON.stringify({
      email: userData.email,
      role: userData.role,
      scopedRole: userData.scopedRole,
    }),
    callbackUrl,
  }

  // Include SAML assertion if available (allows IB to verify)
  if (userData.samlAssertion) {
    requestPayload.samlAssertion = userData.samlAssertion
    requestPayload.assertionReference = `sha256:${computeAssertionHash(userData.samlAssertion)}`
  }

  try {
    const response = await fetch(`${backendUrl}/onboarding/webauthn/options`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildSpAuthHeaders(),
      },
      body: JSON.stringify(requestPayload),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      devLog.error('[InstitutionalOnboarding] Backend error:', response.status, errorText)
      throw new Error(`${OnboardingErrorCode.BACKEND_UNREACHABLE}: ${response.status} - ${errorText}`)
    }

    const data = await response.json()

    if (!data.sessionId) {
      throw new Error(`${OnboardingErrorCode.INVALID_RESPONSE}: Missing sessionId in response`)
    }

    // Build ceremony URL if not provided explicitly
    const ceremonyUrl = data.ceremonyUrl || `${backendUrl}/onboarding/webauthn/ceremony/${data.sessionId}`

    devLog.log('[InstitutionalOnboarding] Onboarding session created:', data.sessionId)

    return {
      sessionId: data.sessionId,
      ceremonyUrl,
      backendUrl,
      stableUserId,
      institutionId,
      expiresAt: data.expiresAt || null,
      options: data.options || null, // WebAuthn options if IB returns them directly
    }
  } catch (error) {
    if (error.message?.startsWith(OnboardingErrorCode.BACKEND_UNREACHABLE) ||
        error.message?.startsWith(OnboardingErrorCode.INVALID_RESPONSE)) {
      throw error
    }
    devLog.error('[InstitutionalOnboarding] Failed to initiate:', error)
    throw new Error(`${OnboardingErrorCode.BACKEND_UNREACHABLE}: ${error.message}`, { cause: error })
  }
}

/**
 * Checks the status of an onboarding session.
 * Used for polling when callback is not available/reliable.
 * 
 * @param {Object} params - Status check parameters
 * @param {string} params.sessionId - Onboarding session ID
 * @param {string} params.backendUrl - IB backend URL
 * @returns {Promise<Object>} Session status
 */
export async function checkOnboardingStatus({ sessionId, backendUrl }) {
  if (!sessionId || !backendUrl) {
    throw new Error('Missing sessionId or backendUrl')
  }

  try {
    const response = await fetch(`${backendUrl}/onboarding/webauthn/status/${sessionId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...buildSpAuthHeaders(),
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        return { status: OnboardingStatus.EXPIRED, sessionId }
      }
      throw new Error(`Status check failed: ${response.status}`)
    }

    const data = await response.json()

    return {
      sessionId,
      status: data.status || OnboardingStatus.PENDING,
      credentialId: data.credentialId || null,
      publicKey: data.publicKey || data.publicKeyCose || data.cosePublicKey || null,
      rpId: data.rpId || null,
      aaguid: data.aaguid || null,
      error: data.error || null,
      timestamp: data.timestamp || null,
    }
  } catch (error) {
    devLog.error('[InstitutionalOnboarding] Status check failed:', error)
    throw error
  }
}

/**
 * Polls onboarding status until completion or timeout.
 * 
 * @param {Object} params - Polling parameters
 * @param {string} params.sessionId - Onboarding session ID
 * @param {string} params.backendUrl - IB backend URL
 * @param {number} [params.intervalMs=2000] - Polling interval in milliseconds
 * @param {number} [params.timeoutMs=120000] - Maximum wait time in milliseconds
 * @param {AbortSignal} [params.signal] - AbortSignal to cancel polling
 * @returns {Promise<Object>} Final session status
 */
export async function pollOnboardingStatus({
  sessionId,
  backendUrl,
  intervalMs = 2000,
  timeoutMs = 120000,
  signal,
}) {
  const startTime = Date.now()

  while (Date.now() - startTime < timeoutMs) {
    if (signal?.aborted) {
      throw new Error('Polling aborted')
    }

    const status = await checkOnboardingStatus({ sessionId, backendUrl })

    // Check for terminal states
    if (status.status === OnboardingStatus.COMPLETED || 
        status.status === OnboardingStatus.SUCCESS) {
      return { ...status, success: true }
    }

    if (status.status === OnboardingStatus.FAILED ||
        status.status === OnboardingStatus.EXPIRED) {
      return { ...status, success: false }
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  return {
    sessionId,
    status: OnboardingStatus.EXPIRED,
    success: false,
    error: 'Polling timeout exceeded',
  }
}

/**
 * Checks if a user is already onboarded with their institution's IB.
 * 
 * Uses IB key-status endpoint.
 * 
 * @param {Object} params - Check parameters
 * @param {Object} params.userData - User data from SAML session
 * @returns {Promise<Object>} Onboarding status for user
 */
export async function checkUserOnboardingStatus({ userData }) {
  if (!userData) {
    return { isOnboarded: false, error: 'No user data' }
  }

  const institutionId = userData.affiliation
  const backendUrl = await resolveInstitutionalBackendUrl(institutionId)

  if (!backendUrl) {
    return { 
      isOnboarded: false, 
      error: OnboardingErrorCode.NO_BACKEND,
      institutionId,
    }
  }

  const stableUserId = extractStableUserId(userData)
  if (!stableUserId) {
    return { 
      isOnboarded: false, 
      error: OnboardingErrorCode.MISSING_USER_DATA,
    }
  }

  try {
    const response = await fetch(
      `${backendUrl}/onboarding/webauthn/key-status/${encodeURIComponent(stableUserId)}?institutionId=${encodeURIComponent(institutionId)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...buildSpAuthHeaders(),
        },
      }
    )

    if (response.status === 404) {
      // User not found = not onboarded
      return {
        isOnboarded: false,
        stableUserId,
        institutionId,
        backendUrl,
      }
    }

    if (!response.ok) {
      // Endpoint might not exist yet
      devLog.warn('[InstitutionalOnboarding] User status check returned:', response.status)
      return {
        isOnboarded: false,
        error: `Status check returned ${response.status}`,
        stableUserId,
        institutionId,
        backendUrl,
      }
    }

    const data = await response.json()

    return {
      isOnboarded: data.hasCredential === true || data.registered === true || data.isOnboarded === true,
      stableUserId,
      institutionId,
      backendUrl,
      credentialId: data.credentialId || null,
      registeredAt: data.lastRegistered || data.registeredAt || null,
    }
  } catch (error) {
    devLog.warn('[InstitutionalOnboarding] User status check failed:', error.message)
    // If the endpoint doesn't exist, assume not onboarded
    return {
      isOnboarded: false,
      stableUserId,
      institutionId,
      backendUrl,
      error: error.message,
    }
  }
}

export default {
  OnboardingStatus,
  OnboardingErrorCode,
  extractStableUserId,
  initiateInstitutionalOnboarding,
  checkOnboardingStatus,
  pollOnboardingStatus,
  checkUserOnboardingStatus,
}
