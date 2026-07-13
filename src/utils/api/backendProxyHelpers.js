/**
 * Shared utilities for institutional backend proxy endpoints
 * Used by API routes in /api/backend/intents/** to forward requests to institutional backends
 */
import marketplaceJwtService from '@/utils/auth/marketplaceJwt'
import { resolveInstitutionDomainFromSession } from '@/utils/auth/institutionDomain'
import { resolveInstitutionalBackendUrl } from '@/utils/onboarding/institutionalBackend'
import devLog from '@/utils/dev/logger'

/**
 * Resolves the backend URL from the authenticated institution's on-chain registration.
 * @param {Object} session - Authenticated SSO session
 * @returns {string|null} Backend URL or null if not configured
 */
export async function resolveBackendUrl(session) {
  const institutionDomain = resolveInstitutionDomainFromSession(session)
  if (!institutionDomain) return null
  return resolveInstitutionalBackendUrl(institutionDomain)
}

/**
 * Resolves headers for forwarding to institutional backend
 * Generates a least-privilege server token for the already resolved backend.
 * @param {string} backendUrl - Trusted backend URL from the on-chain registry
 * @returns {Promise<Object>} Headers object for backend request
 */
export async function resolveForwardHeaders(backendUrl) {
  const headers = { 'Content-Type': 'application/json' }

  try {
    const backendAuth = await marketplaceJwtService.generateIntentBackendToken({
      scope: 'intents:status',
    })
    headers.Authorization = `Bearer ${backendAuth.token}`
  } catch (error) {
    devLog.warn('[API] Failed to generate intent backend token for proxy', error)
  }

  const apiKey = process.env.INSTITUTION_BACKEND_SP_API_KEY
  if (apiKey) {
    headers['x-api-key'] = apiKey
  }
  
  return headers
}
