/**
 * Shared utilities for institutional backend proxy endpoints
 * Used by API routes in /api/backend/intents/** to forward requests to institutional backends
 */
import { createInstitutionalServiceToken } from '@/utils/auth/institutionalServiceCredential'
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
 * Resolves a short-lived, scoped service credential for the canonical
 * institutional backend. Client credentials are ignored.
 * @returns {Promise<Object>} Headers object for backend request
 */
export async function resolveForwardHeaders({ backendUrl, institutionId, scope } = {}) {
  const headers = { 'Content-Type': 'application/json' }

  const backendAuth = await createInstitutionalServiceToken({ backendUrl, institutionId, scope })
  headers.Authorization = `Bearer ${backendAuth.token}`
  return headers
}
