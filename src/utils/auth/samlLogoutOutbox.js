import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'node:crypto'
import { hasRedisConfig, redisCommand } from '@/utils/redis/restClient'

const OUTBOX_INDEX = 'marketplace:saml:logout:outbox'
const OUTBOX_ENTRY_PREFIX = 'marketplace:saml:logout:entry:'
const OUTBOX_RETENTION_SECONDS = 24 * 60 * 60
const MAX_VALUE_LENGTH = 2048
const MAX_RETRY_DELAY_SECONDS = 5 * 60
const memoryRecords = new Map()
const developmentEncryptionKey = randomBytes(32)

const CREATE_OUTBOX_ENTRY_SCRIPT = `
local created = redis.call('SET', KEYS[1], ARGV[1], 'NX', 'EX', ARGV[2])
if created == 'OK' then
  redis.call('ZADD', KEYS[2], ARGV[3], ARGV[4])
  return 1
end
return 0
`
const WRITE_OUTBOX_ENTRY_SCRIPT = `
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
if ARGV[3] == 'pending' then
  redis.call('ZADD', KEYS[2], ARGV[4], ARGV[5])
else
  redis.call('ZREM', KEYS[2], ARGV[5])
end
return 1
`

function encryptionKey() {
  const configured = process.env.SESSION_STORE_ENCRYPTION_KEY
    || process.env.SESSION_ENCRYPTION_KEY
    || process.env.SESSION_SECRET
  if (!configured) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('A SAML logout outbox encryption key is required in production')
    }
    return developmentEncryptionKey
  }
  if (/^[0-9a-f]{64}$/i.test(configured)) return Buffer.from(configured, 'hex')
  return createHash('sha256').update(configured, 'utf8').digest()
}

function normalizeValue(value, label) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized || normalized.length > MAX_VALUE_LENGTH) {
    throw new Error(`${label} is invalid`)
  }
  return normalized
}

function normalizeRequestId(requestId) {
  return normalizeValue(requestId, 'SAML LogoutRequest ID')
}

function requestKey(requestId) {
  return `${OUTBOX_ENTRY_PREFIX}${createHmac('sha256', encryptionKey())
    .update(normalizeRequestId(requestId), 'utf8')
    .digest('hex')}`
}

function encryptRecord(record) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(record), 'utf8'),
    cipher.final(),
  ])
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url')
}

function decryptRecord(value) {
  try {
    const packed = Buffer.from(String(value || ''), 'base64url')
    if (packed.length <= 28) return null
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), packed.subarray(0, 12))
    decipher.setAuthTag(packed.subarray(12, 28))
    const record = JSON.parse(Buffer.concat([
      decipher.update(packed.subarray(28)),
      decipher.final(),
    ]).toString('utf8'))
    return record && typeof record === 'object' ? record : null
  } catch {
    return null
  }
}

function redisEnabled() {
  const configured = hasRedisConfig()
  if (process.env.NODE_ENV === 'production' && !configured) {
    throw new Error('A distributed SAML logout outbox is required in production')
  }
  return process.env.NODE_ENV !== 'test' && configured
}

function sweepMemory(now = Date.now()) {
  for (const [key, entry] of memoryRecords.entries()) {
    if (entry.expiresAt <= now) memoryRecords.delete(key)
  }
}

function buildRecord({ requestId, nameId, sessionIndex, now = Date.now() }) {
  const nowMs = Number(now)
  if (!Number.isFinite(nowMs)) throw new Error('SAML logout outbox time is invalid')
  return {
    requestId: normalizeRequestId(requestId),
    nameId: normalizeValue(nameId, 'SAML NameID'),
    sessionIndex: normalizeValue(sessionIndex, 'SAML SessionIndex'),
    status: 'pending',
    attempts: 0,
    nextAttemptAt: Math.floor(nowMs / 1000),
    expiresAt: nowMs + OUTBOX_RETENTION_SECONDS * 1000,
  }
}

function assertRecordBinding(record, expected) {
  if (
    record.nameId !== expected.nameId
    || record.sessionIndex !== expected.sessionIndex
  ) {
    throw new Error('Invalid SAML logout request outbox binding')
  }
  return record
}

function resultFor(record) {
  return { status: record.status, record }
}

async function readRedisRecord(requestId) {
  const raw = await redisCommand(['GET', requestKey(requestId)])
  const record = decryptRecord(raw)
  if (!record || record.requestId !== normalizeRequestId(requestId)) {
    throw new Error('SAML logout outbox record is invalid')
  }
  return record
}

export async function acceptSamlLogoutRequest({ requestId, nameId, sessionIndex, now = Date.now() }) {
  const record = buildRecord({ requestId, nameId, sessionIndex, now })
  const key = requestKey(record.requestId)
  const ttlSeconds = Math.max(1, Math.ceil((record.expiresAt - Number(now)) / 1000))

  if (redisEnabled()) {
    const created = await redisCommand([
      'EVAL',
      CREATE_OUTBOX_ENTRY_SCRIPT,
      '2',
      key,
      OUTBOX_INDEX,
      encryptRecord(record),
      String(ttlSeconds),
      String(record.nextAttemptAt),
      record.requestId,
    ])
    if (created === 1 || created === '1') return resultFor(record)
    return resultFor(assertRecordBinding(await readRedisRecord(record.requestId), record))
  }

  sweepMemory(Number(now))
  const existing = memoryRecords.get(key)
  if (existing) return resultFor(assertRecordBinding(existing.record, record))
  memoryRecords.set(key, { record, expiresAt: record.expiresAt })
  return resultFor(record)
}

export async function getDueSamlLogoutRequests({ now = Date.now(), limit = 100 } = {}) {
  const nowMs = Number(now)
  const nowSeconds = Math.floor(nowMs / 1000)
  const boundedLimit = Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 500) : 100
  if (!Number.isFinite(nowMs)) return []

  if (redisEnabled()) {
    const members = await redisCommand([
      'ZRANGEBYSCORE',
      OUTBOX_INDEX,
      '-inf',
      String(nowSeconds),
      'LIMIT',
      '0',
      String(boundedLimit),
    ])
    const normalizedMembers = Array.isArray(members) ? members : []
    const values = normalizedMembers.length > 0
      ? await redisCommand(['MGET', ...normalizedMembers.map(requestKey)])
      : []
    const due = []
    for (const [index, requestId] of normalizedMembers.entries()) {
      const record = decryptRecord(values[index])
      if (record?.status === 'pending' && record.expiresAt > nowMs) {
        due.push(record)
      } else {
        await redisCommand(['ZREM', OUTBOX_INDEX, requestId])
      }
    }
    return due
  }

  sweepMemory(nowMs)
  return [...memoryRecords.values()]
    .map((entry) => entry.record)
    .filter((record) => record.status === 'pending' && record.nextAttemptAt <= nowSeconds)
    .slice(0, boundedLimit)
}

export async function rescheduleSamlLogoutRequest({ requestId, attempts = 0, now = Date.now() }) {
  const normalizedRequestId = normalizeRequestId(requestId)
  const nowMs = Number(now)
  const key = requestKey(normalizedRequestId)
  const current = redisEnabled()
    ? await readRedisRecord(normalizedRequestId)
    : memoryRecords.get(key)?.record
  if (!current || current.status === 'completed' || current.expiresAt <= nowMs) return false

  const nextAttempts = Math.max(0, Number.isSafeInteger(attempts) ? attempts : 0) + 1
  const delay = Math.min(MAX_RETRY_DELAY_SECONDS, 30 * (2 ** Math.min(nextAttempts - 1, 4)))
  const next = {
    ...current,
    attempts: nextAttempts,
    nextAttemptAt: Math.min(Math.floor(current.expiresAt / 1000), Math.floor(nowMs / 1000) + delay),
  }
  const ttlSeconds = Math.max(1, Math.ceil((current.expiresAt - nowMs) / 1000))

  if (redisEnabled()) {
    await redisCommand([
      'EVAL',
      WRITE_OUTBOX_ENTRY_SCRIPT,
      '2',
      key,
      OUTBOX_INDEX,
      encryptRecord(next),
      String(ttlSeconds),
      'pending',
      String(next.nextAttemptAt),
      normalizedRequestId,
    ])
  } else {
    memoryRecords.set(key, { record: next, expiresAt: current.expiresAt })
  }
  return true
}

export async function completeSamlLogoutRequest(requestId, now = Date.now()) {
  const normalizedRequestId = normalizeRequestId(requestId)
  const key = requestKey(normalizedRequestId)
  const current = redisEnabled()
    ? await readRedisRecord(normalizedRequestId)
    : memoryRecords.get(key)?.record
  if (!current || current.status === 'completed') return Boolean(current)

  const completed = {
    ...current,
    status: 'completed',
    nextAttemptAt: null,
  }
  const ttlSeconds = Math.max(1, Math.ceil((current.expiresAt - Number(now)) / 1000))
  if (redisEnabled()) {
    await redisCommand([
      'EVAL',
      WRITE_OUTBOX_ENTRY_SCRIPT,
      '2',
      key,
      OUTBOX_INDEX,
      encryptRecord(completed),
      String(ttlSeconds),
      'completed',
      '0',
      normalizedRequestId,
    ])
  } else {
    memoryRecords.set(key, { record: completed, expiresAt: current.expiresAt })
  }
  return true
}

export function clearSamlLogoutOutboxForTests() {
  memoryRecords.clear()
}
