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

/**
 * Cache for resolved backend URLs to avoid repeated lookups
 * @type {Map<string, string>}
 */
const backendCache = new Map()

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

  // Check cache first
  if (backendCache.has(institutionId)) {
    return backendCache.get(institutionId)
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

      let cleaned = rawUrl.trim()
      while (cleaned.endsWith('/')) {
        cleaned = cleaned.slice(0, -1)
      }
      if (cleaned.endsWith('/auth')) {
        cleaned = cleaned.slice(0, -5)
      }
      return cleaned || null
    }

    // Try exact match first
    let backendUrl = await resolveBackend(normalizedId)

    // Try without subdomain variations (e.g., "mail.uned.es" -> "uned.es")
    let baseDomain = null
    if (!backendUrl) {
      const parts = normalizedId.split('.')
      if (parts.length > 2) {
        baseDomain = parts.slice(-2).join('.')
        backendUrl = await resolveBackend(baseDomain)
      }
    }

    if (backendUrl) {
      backendCache.set(institutionId, backendUrl)
      if (normalizedId !== institutionId) {
        backendCache.set(normalizedId, backendUrl)
      }
      if (baseDomain) {
        backendCache.set(baseDomain, backendUrl)
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
  hasInstitutionalBackend,
  clearBackendCache,
}
