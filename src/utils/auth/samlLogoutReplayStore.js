import { createHash } from 'node:crypto'
import { hasRedisConfig, redisCommand } from '@/utils/redis/restClient'

const LOGOUT_REQUEST_PREFIX = 'logout-request:'
const SAML_LOGOUT_REQUEST_VALIDITY_SECONDS = 300
const MAX_REQUEST_ID_LENGTH = 512
const memoryRecords = new Map()

function normalizeRequestId(requestId) {
  if (typeof requestId !== 'string') return null
  const normalized = requestId.trim()
  return normalized && normalized.length <= MAX_REQUEST_ID_LENGTH ? normalized : null
}

function keyFor(requestId) {
  const hash = createHash('sha256').update(requestId, 'utf8').digest('hex')
  return `${LOGOUT_REQUEST_PREFIX}${hash}`
}

function sweepMemoryRecords(now = Date.now()) {
  for (const [key, expiresAt] of memoryRecords.entries()) {
    if (expiresAt <= now) memoryRecords.delete(key)
  }
}

function requireRemoteStoreInProduction(redisConfigured) {
  if (process.env.NODE_ENV === 'production' && !redisConfigured) {
    throw new Error('A distributed SAML logout replay store is required in production')
  }
}

/**
 * Atomically consumes a SAML LogoutRequest ID for the accepted request window.
 * Redis is required in production so replay protection is shared across instances.
 */
export async function consumeSamlLogoutRequestId(requestId) {
  const normalizedRequestId = normalizeRequestId(requestId)
  if (!normalizedRequestId) return false

  const redisConfigured = hasRedisConfig()
  requireRemoteStoreInProduction(redisConfigured)
  const key = keyFor(normalizedRequestId)

  if (process.env.NODE_ENV !== 'test' && redisConfigured) {
    const result = await redisCommand([
      'SET',
      key,
      '1',
      'NX',
      'EX',
      String(SAML_LOGOUT_REQUEST_VALIDITY_SECONDS),
    ])
    return result === 'OK'
  }

  sweepMemoryRecords()
  if (memoryRecords.has(key)) return false
  memoryRecords.set(key, Date.now() + SAML_LOGOUT_REQUEST_VALIDITY_SECONDS * 1000)
  return true
}

export function clearSamlLogoutReplayStoreForTests() {
  memoryRecords.clear()
}
