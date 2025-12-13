/**
 * Institutional Gateway URL Resolution
 * 
 * Resolves the Institutional Backend (IB) gateway URL for a given institution.
 * The IB is operated by the user's home institution and handles:
 * - WebAuthn credential registration (onboarding)
 * - Intent signing with the institutional wallet
 * - Policy enforcement
 * 
 * @module utils/onboarding/institutionalGateway
 */

import devLog from '@/utils/dev/logger'

/**
 * Cache for resolved gateway URLs to avoid repeated lookups
 * @type {Map<string, string>}
 */
const gatewayCache = new Map()

/**
 * Resolves the Institutional Backend gateway URL for a given institution.
 * 
 * TODO: Replace environment variable lookup with on-chain registry query.
 * The institutional gateway URL should be registered on-chain as part of
 * the institution's registration in the protocol. This would allow:
 * - Decentralized discovery of institutional backends
 * - Cryptographic verification of gateway authenticity
 * - Dynamic updates without marketplace redeployment
 * 
 * Current implementation uses INSTITUTION_GATEWAYS env var as a JSON map:
 * INSTITUTION_GATEWAYS={"uned.es":"https://gateway.uned.es","uhu.es":"https://gateway.uhu.es"}
 * 
 * @param {string} institutionId - The institution identifier (e.g., "uned.es" from schacHomeOrganization)
 * @returns {string|null} The gateway URL or null if not found
 */
export function resolveInstitutionalGatewayUrl(institutionId) {
  if (!institutionId) {
    devLog.warn('[InstitutionalGateway] No institutionId provided')
    return null
  }

  // Check cache first
  if (gatewayCache.has(institutionId)) {
    return gatewayCache.get(institutionId)
  }

  // TODO: Replace this with on-chain registry lookup
  // Example future implementation:
  // const registryContract = getInstitutionRegistryContract()
  // const gatewayUrl = await registryContract.getGatewayUrl(institutionId)
  
  const gatewaysJson = process.env.INSTITUTION_GATEWAYS
  if (!gatewaysJson) {
    devLog.warn('[InstitutionalGateway] INSTITUTION_GATEWAYS env var not configured')
    return null
  }

  try {
    const gateways = JSON.parse(gatewaysJson)
    const normalizedId = institutionId.toLowerCase()
    
    // Try exact match first
    let gatewayUrl = gateways[normalizedId] || gateways[institutionId]
    
    // Try without subdomain variations (e.g., "mail.uned.es" -> "uned.es")
    if (!gatewayUrl) {
      const parts = normalizedId.split('.')
      if (parts.length > 2) {
        const baseDomain = parts.slice(-2).join('.')
        gatewayUrl = gateways[baseDomain]
      }
    }

    if (gatewayUrl) {
      // Normalize URL (remove trailing slash)
      gatewayUrl = gatewayUrl.replace(/\/$/, '')
      gatewayCache.set(institutionId, gatewayUrl)
      devLog.log('[InstitutionalGateway] Resolved gateway for', institutionId, '->', gatewayUrl)
      return gatewayUrl
    }

    devLog.warn('[InstitutionalGateway] No gateway configured for institution:', institutionId)
    return null
  } catch (error) {
    devLog.error('[InstitutionalGateway] Failed to parse INSTITUTION_GATEWAYS:', error)
    return null
  }
}

/**
 * Checks if an institution has a configured gateway
 * @param {string} institutionId - The institution identifier
 * @returns {boolean} True if gateway is configured
 */
export function hasInstitutionalGateway(institutionId) {
  return resolveInstitutionalGatewayUrl(institutionId) !== null
}

/**
 * Clears the gateway URL cache (useful for testing)
 */
export function clearGatewayCache() {
  gatewayCache.clear()
}

export default {
  resolveInstitutionalGatewayUrl,
  hasInstitutionalGateway,
  clearGatewayCache,
}
