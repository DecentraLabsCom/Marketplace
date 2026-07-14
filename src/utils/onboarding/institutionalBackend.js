/**
 * Institutional Backend URL Resolution
 * 
 * Resolves the Institutional Backend (IB) URL for a given institution.
 * The IB is operated by the user's home institution and handles:
 * - WebAuthn credential registration (onboarding)
 * - Intent signing with the institutional wallet
 * - Policy enforcement
 * 
 * @module utils/onboarding/institutionalBackend
 */

import devLog from '@/utils/dev/logger'
import marketplaceJwtService from '@/utils/auth/marketplaceJwt'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import {
  institutionalBackendFetch,
  normalizeInstitutionalBackendBaseUrl,
} from '@/utils/api/gatewayProxy'

export { institutionalBackendFetch }

/**
 * Cache for resolved backend URLs to avoid repeated lookups while still
 * allowing on-chain revocations and endpoint changes to take effect.
 * @type {Map<string, { url: string, expiresAt: number }>}
 */
const backendCache = new Map()

// Keep discovery fast without retaining a revoked or replaced backend for the
// lifetime of the browser/server process.
export const INSTITUTIONAL_BACKEND_CACHE_TTL_MS = 5 * 60 * 1000

/**
 * Resolves the Institutional Backend URL for a given institution.
 * 
 * Resolves backend URLs from the on-chain institutional registry.
 * This enables decentralized discovery and dynamic updates without redeploys.
 * 
 * @param {string} institutionId - The institution identifier (e.g., "uned.es" from schacHomeOrganization)
 * @returns {Promise<string|null>} The backend URL or null if not found
 */
export async function resolveInstitutionalBackendUrl(institutionId) {
  if (!institutionId) {
    devLog.warn('[InstitutionalBackend] No institutionId provided')
    return null
  }

  // Check cache first, evicting expired entries before they can be used.
  const now = Date.now()
  const cached = backendCache.get(institutionId)
  if (cached) {
    if (cached.expiresAt > now) {
      return cached.url
    }
    backendCache.delete(institutionId)
  }

  try {
    const normalizedId = marketplaceJwtService.normalizeOrganizationDomain(institutionId)
    const contract = await getContractInstance()
    const resolveBackend = async (domain) => {
      if (typeof contract.getSchacHomeOrganizationBackend !== 'function') {
        return null
      }

      const rawUrl = await contract.getSchacHomeOrganizationBackend(domain)
      if (!rawUrl || typeof rawUrl !== 'string') {
        return null
      }

      return normalizeInstitutionalBackendBaseUrl(rawUrl)
    }

    // Try exact match first
    let backendUrl = await resolveBackend(normalizedId)

    if (backendUrl) {
      const cacheEntry = {
        url: backendUrl,
        expiresAt: now + INSTITUTIONAL_BACKEND_CACHE_TTL_MS,
      }
      backendCache.set(institutionId, cacheEntry)
      if (normalizedId !== institutionId) {
        backendCache.set(normalizedId, cacheEntry)
      }
      devLog.log('[InstitutionalBackend] Resolved backend for', institutionId, '->', backendUrl)
      return backendUrl
    }

    devLog.warn('[InstitutionalBackend] No backend configured for institution:', institutionId)
    return null
  } catch (error) {
    devLog.error('[InstitutionalBackend] Failed to resolve backend:', error)
    return null
  }
}

/**
 * Checks if an institution has a configured backend
 * @param {string} institutionId - The institution identifier
 * @returns {Promise<boolean>} True if backend is configured
 */
export async function hasInstitutionalBackend(institutionId) {
  return (await resolveInstitutionalBackendUrl(institutionId)) !== null
}

/**
 * Clears the backend URL cache (useful for testing)
 */
export function clearBackendCache() {
  backendCache.clear()
}

export default {
  resolveInstitutionalBackendUrl,
  institutionalBackendFetch,
  hasInstitutionalBackend,
  clearBackendCache,
}
