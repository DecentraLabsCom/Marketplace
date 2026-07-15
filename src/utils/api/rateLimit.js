import { createHash } from 'node:crypto'
import { hasRedisConfig, redisCommand } from '@/utils/redis/restClient'

const RATE_LIMIT_SCRIPT = `
local limited = 0
local remaining = tonumber(ARGV[1])
local reset_ms = 0
for _, key in ipairs(KEYS) do
  local count = redis.call('INCR', key)
  if count == 1 then redis.call('PEXPIRE', key, ARGV[2]) end
  local ttl = redis.call('PTTL', key)
  if count > tonumber(ARGV[1]) then limited = 1 end
  remaining = math.min(remaining, math.max(0, tonumber(ARGV[1]) - count))
  reset_ms = math.max(reset_ms, ttl)
end
return { limited, remaining, reset_ms }
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

function getIdentityKeys(operation, request, identity = {}) {
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
  const dimensions = identity.userId || identity.stableUserId || identity.email
    ? [`ip:${ip}`, `user:${user}`, `institution:${institution}`]
    : [`ip:${ip}`]

  return dimensions.map((dimension) => `${prefix}:${hashKeyPart(dimension)}`)
}

function createMemoryRateCheck({ operation, windowMs, maxRequests }) {
  const store = memoryStores.get(operation) || new Map()
  memoryStores.set(operation, store)

  return (request, identity = {}) => {
    const key = getIdentityKeys(operation, request, identity).join('|')
    const now = Date.now()
    let entry = store.get(key)
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs }
      store.set(key, entry)
    }

    entry.count += 1
    return {
      limited: entry.count > maxRequests,
      limit: maxRequests,
      remaining: Math.max(0, maxRequests - entry.count),
      resetAt: entry.resetAt,
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
    limit: maxRequests,
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
} = {}) {
  const memoryCheck = createMemoryRateCheck({ operation, windowMs, maxRequests })

  return async function check(request, identity = {}) {
    // Jest runs with NODE_ENV=test. Never let the local test process mutate a
    // shared production Redis instance, even when .env.local contains KV vars.
    if (process.env.NODE_ENV === 'test') {
      return memoryCheck(request, identity)
    }

    if (!hasRedisConfig()) {
      if (process.env.NODE_ENV === 'production') {
        return { limited: true, unavailable: true, limit: maxRequests, remaining: 0, retryAfterSec: 5 }
      }
      return memoryCheck(request, identity)
    }

    try {
      const keys = getIdentityKeys(operation, request, identity)
      const result = await redisCommand([
        'EVAL',
        RATE_LIMIT_SCRIPT,
        String(keys.length),
        ...keys,
        String(maxRequests),
        String(windowMs),
      ])
      return parseRedisResult(result, maxRequests)
    } catch {
      if (process.env.NODE_ENV === 'production') {
        return { limited: true, unavailable: true, limit: maxRequests, remaining: 0, retryAfterSec: 5 }
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
