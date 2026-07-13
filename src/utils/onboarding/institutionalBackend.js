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
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/**
 * Cache for resolved backend URLs to avoid repeated lookups
 * @type {Map<string, string>}
 */
const backendCache = new Map()

function isPublicIpv4(address) {
  const octets = address.split('.').map(Number)
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false
  }
  const [a, b] = octets
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 168) return false
  if (a === 198 && (b === 18 || b === 19)) return false
  if (a === 192 && b === 0) return false
  if (a === 192 && b === 0 && octets[2] === 2) return false
  if (a === 198 && b === 51 && octets[2] === 100) return false
  if (a === 203 && b === 0 && octets[2] === 113) return false
  return true
}

function isPublicIpAddress(rawAddress) {
  const address = String(rawAddress || '').trim().toLowerCase().replace(/^\[|\]$/g, '')
  const family = isIP(address)
  if (family === 4) return isPublicIpv4(address)
  if (family !== 6) return false
  if (address === '::' || address === '::1') return false
  if (address.startsWith('fc') || address.startsWith('fd')) return false
  if (/^fe[89ab]/.test(address)) return false
  if (address.startsWith('ff') || address.startsWith('2001:db8:')) return false
  const mappedIpv4 = address.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1]
  return mappedIpv4 ? isPublicIpv4(mappedIpv4) : true
}

export async function resolveInstitutionalBackendTarget(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('Institutional backend URL is required')
  }

  let parsed
  try {
    parsed = new URL(rawUrl.trim())
  } catch {
    throw new Error('Institutional backend URL is invalid')
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Institutional backend URL must use HTTPS')
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('Institutional backend URL must be a plain base URL')
  }

  const normalizedPath = parsed.pathname.replace(/\/+$/, '')
  if (normalizedPath && normalizedPath !== '/auth') {
    throw new Error('Institutional backend URL must not include an application path')
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('Institutional backend hostname must be public')
  }

  let addresses
  if (isIP(hostname)) {
    if (!isPublicIpAddress(hostname)) {
      throw new Error('Institutional backend address must be public')
    }
    addresses = [{ address: hostname, family: isIP(hostname) }]
  } else {
    addresses = await lookup(hostname, { all: true, verbatim: true })
    if (!Array.isArray(addresses) || addresses.length === 0) {
      throw new Error('Institutional backend hostname did not resolve')
    }
    if (addresses.some(({ address }) => !isPublicIpAddress(address))) {
      throw new Error('Institutional backend address must be public')
    }
  }

  return {
    baseUrl: `${parsed.origin}${normalizedPath}`,
    hostname,
    addresses: addresses.map(({ address, family }) => ({ address, family })),
  }
}

export async function validateInstitutionalBackendUrl(rawUrl) {
  const target = await resolveInstitutionalBackendTarget(rawUrl)
  return target.baseUrl
}

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

      return validateInstitutionalBackendUrl(rawUrl)
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
  resolveInstitutionalBackendTarget,
  validateInstitutionalBackendUrl,
  hasInstitutionalBackend,
  clearBackendCache,
}
