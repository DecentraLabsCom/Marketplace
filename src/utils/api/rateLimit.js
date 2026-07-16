import { createHash } from 'node:crypto'
import { hasRedisConfig, redisCommand } from '@/utils/redis/restClient'

const RATE_LIMIT_SCRIPT = `
local limited = 0
local remaining = nil
local reset_ms = 0
local limited_limit = 0
for index, key in ipairs(KEYS) do
  local limit = tonumber(ARGV[index])
  local count = tonumber(redis.call('GET', key) or '0')
  local ttl = redis.call('PTTL', key)
  if count >= limit then
    limited = 1
    if limited_limit == 0 or limit < limited_limit then limited_limit = limit end
  end
  local key_remaining = math.max(0, limit - count)
  if remaining == nil then remaining = key_remaining else remaining = math.min(remaining, key_remaining) end
  reset_ms = math.max(reset_ms, ttl)
end
if limited == 1 then return { limited, remaining or 0, reset_ms, limited_limit } end

remaining = nil
reset_ms = 0
for index, key in ipairs(KEYS) do
  local limit = tonumber(ARGV[index])
  local count = redis.call('INCR', key)
  if count == 1 then redis.call('PEXPIRE', key, ARGV[#ARGV]) end
  local ttl = redis.call('PTTL', key)
  local key_remaining = math.max(0, limit - count)
  if remaining == nil then remaining = key_remaining else remaining = math.min(remaining, key_remaining) end
  reset_ms = math.max(reset_ms, ttl)
end
return { 0, remaining or 0, reset_ms, 0 }
`

const memoryStores = new Map()

const normalizeIdentity = (value, fallback = 'anonymous') => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return normalized || fallback
}

const hashKeyPart = (value) => createHash('sha256').update(value).digest('hex').slice(0, 32)

/**
 * Vercel sets these platform headers before the request reaches the function.
 * The first forwarded address is the client address in the supported topology.
 */
export function resolveClientIp(request) {
  const getHeader = (name) => {
    if (typeof request?.headers?.get === 'function') return request.headers.get(name)
    return request?.headers?.[name] || request?.headers?.[name.toLowerCase()]
  }
  const realIp = getHeader('x-real-ip')?.trim()
  if (realIp) return realIp

  const forwarded = getHeader('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() || 'unknown'
}

function getIdentityDimensions(operation, request, identity = {}, limits = {}) {
  const ip = normalizeIdentity(resolveClientIp(request), 'unknown-ip')
  const user = normalizeIdentity(
    identity.userId || identity.stableUserId || identity.email,
    'anonymous-user',
  )
  const institution = normalizeIdentity(
    identity.institutionId || identity.institution || identity.schacHomeOrganization,
    'anonymous-institution',
  )
  const prefix = `marketplace:rate:${normalizeIdentity(operation, 'unknown-operation')}`
  const isAuthenticated = Boolean(identity.userId || identity.stableUserId || identity.email)
  const dimensions = isAuthenticated
    ? [
      { value: `ip:${ip}`, limit: limits.ip },
      { value: `user:${user}`, limit: limits.user },
      { value: `institution:${institution}`, limit: limits.institution },
    ]
    : [{ value: `ip:${ip}`, limit: limits.anonymousIp }]

  return dimensions.map(({ value, limit }) => ({
    key: `${prefix}:${hashKeyPart(value)}`,
    limit,
  }))
}

function createMemoryRateCheck({ operation, windowMs, limits }) {
  const store = memoryStores.get(operation) || new Map()
  memoryStores.set(operation, store)

  return (request, identity = {}) => {
    const now = Date.now()
    const dimensions = getIdentityDimensions(operation, request, identity, limits)
    const entries = dimensions.map(({ key, limit }) => {
      let entry = store.get(key)
      if (!entry || now >= entry.resetAt) {
        entry = { count: 0, resetAt: now + windowMs }
      }
      return {
        key,
        entry,
        limit,
      }
    })
    const limitingResult = entries.find(({ entry, limit }) => entry.count >= limit)
    const remaining = Math.min(...entries.map(({ entry, limit }) => Math.max(0, limit - entry.count)))
    const resetAt = Math.max(...entries.map(({ entry }) => entry.resetAt))
    if (limitingResult) {
      return {
        limited: true,
        limit: limitingResult.limit,
        remaining,
        resetAt,
      }
    }

    entries.forEach(({ key, entry }) => {
      entry.count += 1
      store.set(key, entry)
    })
    return {
      limited: false,
      limit: Math.min(...entries.map(({ limit }) => limit)),
      remaining: Math.min(...entries.map(({ entry, limit }) => Math.max(0, limit - entry.count))),
      resetAt,
    }
  }
}

function parseRedisResult(result, maxRequests, now = Date.now()) {
  const values = Array.isArray(result) ? result : []
  const limited = Number(values[0]) === 1
  const remaining = Math.max(0, Number(values[1]) || 0)
  const resetMs = Math.max(0, Number(values[2]) || 0)
  return {
    limited,
    limit: Number(values[3]) || maxRequests,
    remaining: Math.min(maxRequests, remaining),
    resetAt: now + resetMs,
    retryAfterSec: Math.max(1, Math.ceil(resetMs / 1000)),
  }
}

/**
 * Create a distributed fixed-window rate limiter.
 * Production fails closed when the coordinator is unavailable; a local
 * fallback would be bypassable across Vercel instances.
 */
export function createRateLimiter({
  operation = 'unknown',
  windowMs = 60_000,
  maxRequests = 15,
  limits: configuredLimits = {},
} = {}) {
  const normalizedMax = Number.isSafeInteger(maxRequests) && maxRequests > 0 ? maxRequests : 15
  const normalizeLimit = (value, fallback) => (
    Number.isSafeInteger(value) && value > 0 ? value : fallback
  )
  const limits = {
    user: normalizeLimit(configuredLimits.user, normalizedMax),
    institution: normalizeLimit(configuredLimits.institution, normalizedMax * 10),
    ip: normalizeLimit(configuredLimits.ip, normalizedMax * 3),
    anonymousIp: normalizeLimit(configuredLimits.anonymousIp, normalizedMax),
  }
  const memoryCheck = createMemoryRateCheck({ operation, windowMs, limits })

  return async function check(request, identity = {}) {
    // Jest runs with NODE_ENV=test. Never let the local test process mutate a
    // shared production Redis instance, even when .env.local contains KV vars.
    if (process.env.NODE_ENV === 'test') {
      return memoryCheck(request, identity)
    }

    if (!hasRedisConfig()) {
      if (process.env.NODE_ENV === 'production') {
        return { limited: true, unavailable: true, limit: normalizedMax, remaining: 0, retryAfterSec: 5 }
      }
      return memoryCheck(request, identity)
    }

    try {
      const dimensions = getIdentityDimensions(operation, request, identity, limits)
      const result = await redisCommand([
        'EVAL',
        RATE_LIMIT_SCRIPT,
        String(dimensions.length),
        ...dimensions.map(({ key }) => key),
        ...dimensions.map(({ limit }) => String(limit)),
        String(windowMs),
      ])
      return parseRedisResult(result, normalizedMax)
    } catch {
      if (process.env.NODE_ENV === 'production') {
        return { limited: true, unavailable: true, limit: normalizedMax, remaining: 0, retryAfterSec: 5 }
      }
      return memoryCheck(request, identity)
    }
  }
}

export function createRateLimitResponse(
  result,
  message = 'Too many requests - please try again later',
) {
  if (!result?.limited && !result?.unavailable) return null

  const status = result.unavailable ? 503 : 429
  const body = result.unavailable
    ? { error: 'Rate limiting is temporarily unavailable. Please try again later.' }
    : { error: message }

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(result.retryAfterSec || 5),
      'X-RateLimit-Limit': String(result.limit || 0),
      'X-RateLimit-Remaining': String(result.remaining || 0),
      'X-RateLimit-Reset': String(Math.ceil((result.resetAt || Date.now()) / 1000)),
    },
  })
}

export function clearRateLimitStoresForTests() {
  for (const store of memoryStores.values()) store.clear()
  memoryStores.clear()
}
