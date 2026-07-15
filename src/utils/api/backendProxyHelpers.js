/**
 * Shared utilities for institutional backend proxy endpoints
 * Used by API routes in /api/backend/intents/** to forward requests to institutional backends
 */
import marketplaceJwtService from '@/utils/auth/marketplaceJwt'
import devLog from '@/utils/dev/logger'
import { resolveInstitutionalBackendUrl } from '@/utils/onboarding/institutionalBackend'
import { resolveInstitutionDomainFromSession } from '@/utils/auth/institutionDomain'
import { requireAuth } from '@/utils/auth/guards'

/**
 * Resolves the backend URL from the authenticated session's institution.
 * Client query parameters are deliberately ignored.
 * @returns {Promise<{backendUrl: string|null, session: Object, institutionDomain: string|null}>}
 */
export async function resolveBackendUrlForSession() {
  const session = await requireAuth()
  const institutionDomain = resolveInstitutionDomainFromSession(session)
  const backendUrl = institutionDomain
    ? await resolveInstitutionalBackendUrl(institutionDomain)
    : null

  return { backendUrl, session, institutionDomain }
}

/**
 * Resolves server-generated credentials for forwarding to the canonical
 * institutional backend. Client authorization and API-key headers are ignored.
 * @returns {Promise<Object>} Headers object for backend request
 */
export async function resolveForwardHeaders() {
  const headers = { 'Content-Type': 'application/json' }

  try {
    const backendAuth = await marketplaceJwtService.generateIntentBackendToken()
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
