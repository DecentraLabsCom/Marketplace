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
import { createHash } from 'node:crypto'
import { hasRedisConfig, redisCommand } from '@/utils/redis/restClient'

export { institutionalBackendFetch }

/**
 * Cache for resolved backend URLs to avoid repeated lookups while still
 * allowing on-chain revocations and endpoint changes to take effect.
 * @type {Map<string, { url: string, expiresAt: number }>}
 */
const backendCache = new Map()
const deniedBackends = new Map()

// Sensitive backend discovery must converge quickly after a revocation. When
// Redis is configured this cache and the emergency denylist are shared by all
// Marketplace instances; memory is only a development fallback.
export const INSTITUTIONAL_BACKEND_CACHE_TTL_MS = 60 * 1000
const BACKEND_CACHE_PREFIX = 'marketplace:institutional-backend:cache:'
const BACKEND_DENYLIST_PREFIX = 'marketplace:institutional-backend:deny:'

const cacheKey = (prefix, institutionId) => `${prefix}${createHash('sha256')
  .update(institutionId)
  .digest('hex')}`

const cacheTtlSeconds = () => Math.max(1, Math.ceil(INSTITUTIONAL_BACKEND_CACHE_TTL_MS / 1000))

function removeMemoryCache(institutionId, normalizedId = institutionId) {
  backendCache.delete(institutionId)
  backendCache.delete(normalizedId)
}

function isMemoryDenied(institutionId, now = Date.now()) {
  const expiresAt = deniedBackends.get(institutionId)
  if (!expiresAt) return false
  if (expiresAt > now) return true
  deniedBackends.delete(institutionId)
  return false
}

async function isBackendDenied(normalizedId) {
  if (isMemoryDenied(normalizedId)) return true
  if (!hasRedisConfig()) return false
  try {
    return Boolean(await redisCommand(['GET', cacheKey(BACKEND_DENYLIST_PREFIX, normalizedId)]))
  } catch {
    return false
  }
}

/**
 * Returns the current emergency suspension state for platform-admin status
 * views. It intentionally exposes only a boolean, never the underlying
 * denylist key or cache internals.
 */
export async function isInstitutionalBackendSuspended(institutionId) {
  if (!institutionId || typeof institutionId !== 'string') return false
  try {
    const normalizedId = marketplaceJwtService.normalizeOrganizationDomain(institutionId)
    return isBackendDenied(normalizedId)
  } catch {
    return false
  }
}

async function readCachedBackend(institutionId, normalizedId) {
  if (hasRedisConfig()) {
    try {
      const cached = await redisCommand(['GET', cacheKey(BACKEND_CACHE_PREFIX, normalizedId)])
      if (typeof cached === 'string' && cached) return normalizeInstitutionalBackendBaseUrl(cached)
    } catch {
      // Fall through to a fresh on-chain lookup; a stale backend is worse
      // than an extra lookup while the distributed cache is unavailable.
    }
    return null
  }

  const now = Date.now()
  const cached = backendCache.get(institutionId) || backendCache.get(normalizedId)
  if (!cached) return null
  if (cached.expiresAt > now) return cached.url
  removeMemoryCache(institutionId, normalizedId)
  return null
}

async function cacheResolvedBackend(institutionId, normalizedId, url) {
  if (hasRedisConfig()) {
    try {
      await redisCommand([
        'SET',
        cacheKey(BACKEND_CACHE_PREFIX, normalizedId),
        url,
        'EX',
        String(cacheTtlSeconds()),
      ])
    } catch {
      // Do not serve an instance-local stale value after a distributed-cache
      // failure; the next request will read the registry again.
    }
    return
  }

  const cacheEntry = { url, expiresAt: Date.now() + INSTITUTIONAL_BACKEND_CACHE_TTL_MS }
  backendCache.set(institutionId, cacheEntry)
  backendCache.set(normalizedId, cacheEntry)
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

  try {
    const normalizedId = marketplaceJwtService.normalizeOrganizationDomain(institutionId)
    if (await isBackendDenied(normalizedId)) {
      devLog.warn('[InstitutionalBackend] Backend is emergency-disabled for institution:', normalizedId)
      return null
    }

    const cached = await readCachedBackend(institutionId, normalizedId)
    if (cached) return cached

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
      await cacheResolvedBackend(institutionId, normalizedId, backendUrl)
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
  deniedBackends.clear()
}

/** Remove a stale cached registry result after a confirmed backend update. */
export async function invalidateInstitutionalBackend(institutionId) {
  const normalizedId = marketplaceJwtService.normalizeOrganizationDomain(institutionId)
  removeMemoryCache(institutionId, normalizedId)
  if (hasRedisConfig()) {
    try {
      await redisCommand(['DEL', cacheKey(BACKEND_CACHE_PREFIX, normalizedId)])
    } catch {
      // The one-minute TTL remains the fallback when the cache service is down.
    }
  }
}

/** Emergency shared denylist used while a backend is being revoked or investigated. */
export async function denyInstitutionalBackend(institutionId, { ttlSeconds = 3600 } = {}) {
  const normalizedId = marketplaceJwtService.normalizeOrganizationDomain(institutionId)
  const ttl = Number.isSafeInteger(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds : 3600
  deniedBackends.set(normalizedId, Date.now() + ttl * 1000)
  await invalidateInstitutionalBackend(normalizedId)
  if (hasRedisConfig()) {
    try {
      await redisCommand(['SET', cacheKey(BACKEND_DENYLIST_PREFIX, normalizedId), '1', 'EX', String(ttl)])
    } catch {
      // The local process still denies immediately; callers can retry the
      // operation once Redis recovers to propagate it globally.
    }
  }
}

export async function restoreInstitutionalBackend(institutionId) {
  const normalizedId = marketplaceJwtService.normalizeOrganizationDomain(institutionId)
  deniedBackends.delete(normalizedId)
  if (hasRedisConfig()) {
    try {
      await redisCommand(['DEL', cacheKey(BACKEND_DENYLIST_PREFIX, normalizedId)])
    } catch {
      // A local restore cannot override an unknown shared denylist failure.
    }
  }
  await invalidateInstitutionalBackend(normalizedId)
}

export default {
  resolveInstitutionalBackendUrl,
  institutionalBackendFetch,
  hasInstitutionalBackend,
  isInstitutionalBackendSuspended,
  clearBackendCache,
  invalidateInstitutionalBackend,
  denyInstitutionalBackend,
  restoreInstitutionalBackend,
}
