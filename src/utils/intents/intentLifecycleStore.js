import { hasRedisConfig, redisCommand } from '@/utils/redis/restClient'

const INTENT_KEY_PREFIX = 'marketplace:intent-lifecycle:'
const INTENT_INDEX_KEY = 'marketplace:intent-lifecycle:index'
const RETENTION_SECONDS = 24 * 60 * 60

const normalizeRequestId = (requestId) => {
  const value = typeof requestId === 'string' ? requestId.trim() : ''
  return value && value !== 'null' && value !== 'undefined' ? value : null
}

const keyFor = (requestId) => `${INTENT_KEY_PREFIX}${requestId}`

const resolveTtlSeconds = (expiresAt) => {
  const expiry = Number(expiresAt)
  const remaining = Number.isFinite(expiry)
    ? Math.ceil(expiry - Date.now() / 1000)
    : 0
  return Math.max(60, remaining + RETENTION_SECONDS)
}

export async function recordRegisteredIntent({
  requestId,
  authorizationSessionId,
  institutionDomain,
  expiresAt,
} = {}) {
  const normalizedRequestId = normalizeRequestId(requestId)
  if (!normalizedRequestId || !hasRedisConfig()) return false

  const record = {
    requestId: normalizedRequestId,
    authorizationSessionId: authorizationSessionId || null,
    institutionDomain: institutionDomain || null,
    expiresAt: expiresAt || null,
    recordedAt: new Date().toISOString(),
  }

  await redisCommand([
    'SET',
    keyFor(normalizedRequestId),
    JSON.stringify(record),
    'EX',
    String(resolveTtlSeconds(expiresAt)),
  ])
  await redisCommand(['SADD', INTENT_INDEX_KEY, normalizedRequestId])
  return true
}

export async function getRegisteredIntent(requestId) {
  const normalizedRequestId = normalizeRequestId(requestId)
  if (!normalizedRequestId || !hasRedisConfig()) return null
  const raw = await redisCommand(['GET', keyFor(normalizedRequestId)])
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function removeRegisteredIntent(requestId) {
  const normalizedRequestId = normalizeRequestId(requestId)
  if (!normalizedRequestId || !hasRedisConfig()) return false
  await redisCommand(['DEL', keyFor(normalizedRequestId)])
  await redisCommand(['SREM', INTENT_INDEX_KEY, normalizedRequestId])
  return true
}

export async function listRegisteredIntentIds(limit = 50) {
  if (!hasRedisConfig()) return []
  const result = await redisCommand(['SMEMBERS', INTENT_INDEX_KEY])
  return (Array.isArray(result) ? result : [])
    .map(normalizeRequestId)
    .filter(Boolean)
    .slice(0, Math.max(1, Number(limit) || 50))
}

export default {
  recordRegisteredIntent,
  getRegisteredIntent,
  removeRegisteredIntent,
  listRegisteredIntentIds,
}
