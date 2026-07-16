import { createHash } from 'node:crypto'
import { hasRedisConfig, redisCommand } from '@/utils/redis/restClient'

const EXCEPTION_INDEX_KEY = 'metadata:origin-exceptions'
const EXCEPTION_KEY_PREFIX = 'metadata:origin-exception:'
const MAX_EXCEPTION_RESULTS = 100

export class MetadataOriginExceptionError extends Error {
  constructor(message) {
    super(message)
    this.name = 'MetadataOriginExceptionError'
    this.code = 'INVALID_METADATA_ORIGIN_EXCEPTION'
  }
}

const keyForOrigin = (origin) => (
  `${EXCEPTION_KEY_PREFIX}${createHash('sha256').update(origin).digest('hex')}`
)

const text = (value, field, { min = 1, max = 512 } = {}) => {
  if (typeof value !== 'string') throw new MetadataOriginExceptionError(`${field} is required`)
  const normalized = value.trim()
  if (normalized.length < min || normalized.length > max) {
    throw new MetadataOriginExceptionError(`${field} must be between ${min} and ${max} characters`)
  }
  return normalized
}

export function normalizeMetadataExceptionOrigin(value) {
  const candidate = text(value, 'Origin', { max: 2048 })
  let parsed
  try {
    parsed = new URL(candidate)
  } catch {
    throw new MetadataOriginExceptionError('Origin must be an exact HTTPS origin')
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    throw new MetadataOriginExceptionError('Origin must be an exact HTTPS origin')
  }
  return parsed.origin
}

function normalizeOptionalExpiry(value) {
  if (value === undefined || value === null || value === '') return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
    throw new MetadataOriginExceptionError('Expiry must be a future ISO timestamp')
  }
  return date.toISOString()
}

function parseRecord(value) {
  if (typeof value !== 'string' || !value) return null
  try {
    const record = JSON.parse(value)
    const origin = normalizeMetadataExceptionOrigin(record?.origin)
    const owner = text(record?.owner, 'Owner', { max: 160 })
    const reason = text(record?.reason, 'Reason', { min: 3, max: 1_000 })
    const expiresAt = record?.expiresAt ? new Date(record.expiresAt).toISOString() : null
    return {
      origin,
      owner,
      reason,
      createdAt: typeof record?.createdAt === 'string' ? record.createdAt : null,
      createdBy: typeof record?.createdBy === 'string' ? record.createdBy : null,
      updatedAt: typeof record?.updatedAt === 'string' ? record.updatedAt : null,
      updatedBy: typeof record?.updatedBy === 'string' ? record.updatedBy : null,
      expiresAt: Number.isNaN(new Date(expiresAt || 0).getTime()) ? null : expiresAt,
    }
  } catch {
    return null
  }
}

const isExpired = (record, now = Date.now()) => (
  Boolean(record?.expiresAt) && new Date(record.expiresAt).getTime() <= now
)

/**
 * Dynamic exceptions complement (never replace) the provider's on-chain exact
 * backend origins. They are intentionally unavailable when Redis is down so
 * an operational failure cannot expand metadata egress trust.
 */
export async function listMetadataOriginExceptions({ limit = MAX_EXCEPTION_RESULTS } = {}) {
  if (!hasRedisConfig()) return []

  const normalizedLimit = Math.max(1, Math.min(MAX_EXCEPTION_RESULTS, Number(limit) || MAX_EXCEPTION_RESULTS))
  let origins
  try {
    origins = await redisCommand([
      'ZREVRANGE',
      EXCEPTION_INDEX_KEY,
      '0',
      String(normalizedLimit - 1),
    ])
  } catch {
    return []
  }
  if (!Array.isArray(origins)) return []

  const records = []
  for (const rawOrigin of origins) {
    let origin
    try {
      origin = normalizeMetadataExceptionOrigin(rawOrigin)
    } catch {
      continue
    }

    let record
    try {
      record = parseRecord(await redisCommand(['GET', keyForOrigin(origin)]))
    } catch {
      continue
    }
    if (!record || record.origin !== origin || isExpired(record)) {
      await redisCommand(['ZREM', EXCEPTION_INDEX_KEY, origin]).catch(() => {})
      if (record && isExpired(record)) {
        await redisCommand(['DEL', keyForOrigin(origin)]).catch(() => {})
      }
      continue
    }
    records.push(record)
  }
  return records
}

export async function getDynamicMetadataExceptionOrigins() {
  const records = await listMetadataOriginExceptions()
  return records.map((record) => record.origin)
}

export async function setMetadataOriginException({ origin, owner, reason, expiresAt, updatedBy }) {
  if (!hasRedisConfig()) {
    throw new Error('Redis is required to manage metadata origin exceptions')
  }
  const normalizedOrigin = normalizeMetadataExceptionOrigin(origin)
  const normalizedOwner = text(owner, 'Owner', { max: 160 })
  const normalizedReason = text(reason, 'Reason', { min: 3, max: 1_000 })
  const actor = text(updatedBy, 'Administrator', { max: 320 })
  const normalizedExpiry = normalizeOptionalExpiry(expiresAt)
  const key = keyForOrigin(normalizedOrigin)
  const existing = parseRecord(await redisCommand(['GET', key]))
  const now = new Date().toISOString()
  const record = {
    origin: normalizedOrigin,
    owner: normalizedOwner,
    reason: normalizedReason,
    createdAt: existing?.createdAt || now,
    createdBy: existing?.createdBy || actor,
    updatedAt: now,
    updatedBy: actor,
    expiresAt: normalizedExpiry,
  }

  await redisCommand(['SET', key, JSON.stringify(record)])
  await redisCommand([
    'ZADD',
    EXCEPTION_INDEX_KEY,
    String(Math.floor(new Date(record.createdAt).getTime() / 1000)),
    normalizedOrigin,
  ])
  return record
}

export async function removeMetadataOriginException(origin) {
  if (!hasRedisConfig()) {
    throw new Error('Redis is required to manage metadata origin exceptions')
  }
  const normalizedOrigin = normalizeMetadataExceptionOrigin(origin)
  await redisCommand(['DEL', keyForOrigin(normalizedOrigin)])
  await redisCommand(['ZREM', EXCEPTION_INDEX_KEY, normalizedOrigin])
}

export default {
  getDynamicMetadataExceptionOrigins,
  listMetadataOriginExceptions,
  normalizeMetadataExceptionOrigin,
  removeMetadataOriginException,
  setMetadataOriginException,
}
