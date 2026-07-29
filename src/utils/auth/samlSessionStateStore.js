import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto'
import { hasRedisConfig, redisCommand } from '@/utils/redis/restClient'
import { isServerSessionId } from './sessionStore'

const SAML_BINDING_PREFIX = 'marketplace:saml:binding:'
const FMU_CAPABILITY_PREFIX = 'marketplace:fmu:capabilities:'
const FMU_REVOCATION_OUTBOX_INDEX = 'marketplace:fmu:revocation:outbox'
const FMU_REVOCATION_OUTBOX_PREFIX = 'marketplace:fmu:revocation:entry:'
const MAX_BINDING_VALUE_LENGTH = 2048
const MAX_TTL_SECONDS = 7 * 24 * 60 * 60
const MAX_REVOCATION_RETRY_DELAY_SECONDS = 5 * 60
// The session index is retained until the latest capability can expire. The
// TTL comparison must happen in the same Redis script as SADD to avoid races.
const REGISTER_FMU_CAPABILITY_SCRIPT = `
local added = redis.call('SADD', KEYS[1], ARGV[1])
local current_ttl = redis.call('TTL', KEYS[1])
local requested_ttl = tonumber(ARGV[2]) or 0
if current_ttl < requested_ttl then
  redis.call('EXPIRE', KEYS[1], requested_ttl)
end
return added
`
const REMOVE_SAML_SESSION_BINDING_MEMBER_SCRIPT = `
local removed = redis.call('SREM', KEYS[1], ARGV[1])
if redis.call('SCARD', KEYS[1]) == 0 then
  redis.call('DEL', KEYS[1])
end
return removed
`
const ENQUEUE_FMU_REVOCATION_SCRIPT = `
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
redis.call('ZADD', KEYS[2], ARGV[3], ARGV[4])
return 1
`
const ACK_FMU_REVOCATION_SCRIPT = `
redis.call('DEL', KEYS[1])
redis.call('ZREM', KEYS[2], ARGV[1])
return 1
`
const memoryBindings = new Map()
const memoryCapabilities = new Map()
const memoryRevocationOutbox = new Map()
const developmentEncryptionKey = randomBytes(32)

function normalizeBindingValue(value, label) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized || normalized.length > MAX_BINDING_VALUE_LENGTH) {
    throw new Error(`${label} is invalid`)
  }
  return normalized
}

function normalizeSessionId(sessionId) {
  if (!isServerSessionId(sessionId)) throw new Error('Marketplace session ID is invalid')
  return sessionId
}

function normalizeTtl(ttlSeconds) {
  const ttl = Number(ttlSeconds)
  if (!Number.isSafeInteger(ttl) || ttl < 1 || ttl > MAX_TTL_SECONDS) {
    throw new Error('Session state TTL is invalid')
  }
  return ttl
}

function stateKey(prefix, values) {
  return `${prefix}${createHmac('sha256', encryptionKey()).update(values.join('\0'), 'utf8').digest('hex')}`
}

function samlBindingKey(nameId, sessionIndex) {
  return stateKey(SAML_BINDING_PREFIX, [nameId, sessionIndex])
}

function capabilityKey(sessionId) {
  return `${FMU_CAPABILITY_PREFIX}${sessionId}`
}

function capabilityIdentity(context) {
  let gatewayOrigin
  try {
    gatewayOrigin = new URL(context?.gatewayOrigin).origin
  } catch {
    gatewayOrigin = ''
  }
  return `${gatewayOrigin}\0${String(context?.resourceSessionId || '')}`
}

function revocationMember(sessionId, context) {
  return createHmac('sha256', encryptionKey())
    .update('marketplace-fmu-revocation\0')
    .update(String(sessionId))
    .update('\0')
    .update(capabilityIdentity(context))
    .digest('hex')
}

function revocationEntryKey(member) {
  return `${FMU_REVOCATION_OUTBOX_PREFIX}${member}`
}

function redisEnabled() {
  const configured = hasRedisConfig()
  if (process.env.NODE_ENV === 'production' && !configured) {
    throw new Error('A distributed SAML session state store is required in production')
  }
  return process.env.NODE_ENV !== 'test' && configured
}

function encryptionKey() {
  const configured = process.env.SESSION_STORE_ENCRYPTION_KEY
    || process.env.SESSION_ENCRYPTION_KEY
    || process.env.SESSION_SECRET
  if (!configured) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('A session state encryption key is required in production')
    }
    return developmentEncryptionKey
  }
  if (/^[0-9a-f]{64}$/i.test(configured)) return Buffer.from(configured, 'hex')
  return createHash('sha256').update(configured, 'utf8').digest()
}

function encryptCapability(context) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(context), 'utf8'),
    cipher.final(),
  ])
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url')
}

function decryptCapability(value) {
  try {
    const packed = Buffer.from(String(value || ''), 'base64url')
    if (packed.length <= 28) return null
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), packed.subarray(0, 12))
    decipher.setAuthTag(packed.subarray(12, 28))
    const plaintext = Buffer.concat([
      decipher.update(packed.subarray(28)),
      decipher.final(),
    ])
    const context = JSON.parse(plaintext.toString('utf8'))
    return context && typeof context === 'object' ? context : null
  } catch {
    return null
  }
}

function sweepMemory(now = Date.now()) {
  for (const [key, records] of memoryBindings.entries()) {
    for (const [sessionId, expiresAt] of records.entries()) {
      if (expiresAt <= now) records.delete(sessionId)
    }
    if (records.size === 0) memoryBindings.delete(key)
  }
  for (const [sessionId, records] of memoryCapabilities.entries()) {
    for (const [value, expiresAt] of records.entries()) {
      if (expiresAt <= now) records.delete(value)
    }
    if (records.size === 0) memoryCapabilities.delete(sessionId)
  }
  for (const [member, entry] of memoryRevocationOutbox.entries()) {
    if (entry.expiresAt <= now) memoryRevocationOutbox.delete(member)
  }
}

export async function registerSamlSessionBinding({ sessionId, nameId, sessionIndex, ttlSeconds }) {
  const normalizedSessionId = normalizeSessionId(sessionId)
  const normalizedNameId = normalizeBindingValue(nameId, 'SAML NameID')
  const normalizedSessionIndex = normalizeBindingValue(sessionIndex, 'SAML SessionIndex')
  const ttl = normalizeTtl(ttlSeconds)
  const key = samlBindingKey(normalizedNameId, normalizedSessionIndex)

  if (redisEnabled()) {
    await redisCommand(['SADD', key, normalizedSessionId])
    await redisCommand(['EXPIRE', key, String(ttl)])
    return
  }

  sweepMemory()
  const records = memoryBindings.get(key) || new Map()
  records.set(normalizedSessionId, Date.now() + ttl * 1000)
  memoryBindings.set(key, records)
}

export async function getSamlSessionIds(nameId, sessionIndex) {
  const key = samlBindingKey(
    normalizeBindingValue(nameId, 'SAML NameID'),
    normalizeBindingValue(sessionIndex, 'SAML SessionIndex'),
  )
  if (redisEnabled()) {
    const values = await redisCommand(['SMEMBERS', key])
    return Array.isArray(values) ? values.filter(isServerSessionId) : []
  }
  sweepMemory()
  return [...(memoryBindings.get(key)?.keys() || [])].filter(isServerSessionId)
}

export async function clearSamlSessionBinding(nameId, sessionIndex) {
  const key = samlBindingKey(
    normalizeBindingValue(nameId, 'SAML NameID'),
    normalizeBindingValue(sessionIndex, 'SAML SessionIndex'),
  )
  if (redisEnabled()) {
    await redisCommand(['DEL', key])
    return
  }
  memoryBindings.delete(key)
}

export async function removeSamlSessionBindingMember(nameId, sessionIndex, sessionId) {
  const key = samlBindingKey(
    normalizeBindingValue(nameId, 'SAML NameID'),
    normalizeBindingValue(sessionIndex, 'SAML SessionIndex'),
  )
  const normalizedSessionId = normalizeSessionId(sessionId)

  if (redisEnabled()) {
    await redisCommand([
      'EVAL',
      REMOVE_SAML_SESSION_BINDING_MEMBER_SCRIPT,
      '1',
      key,
      normalizedSessionId,
    ])
    return
  }

  sweepMemory()
  const records = memoryBindings.get(key)
  if (!records) return
  records.delete(normalizedSessionId)
  if (records.size === 0) memoryBindings.delete(key)
}

export async function registerFmuCapabilityForSession({ sessionId, context, ttlSeconds }) {
  const normalizedSessionId = normalizeSessionId(sessionId)
  if (!context || typeof context !== 'object') throw new Error('FMU capability context is required')
  const ttl = normalizeTtl(ttlSeconds)
  const encrypted = encryptCapability(context)
  const key = capabilityKey(normalizedSessionId)

  if (redisEnabled()) {
    await redisCommand([
      'EVAL',
      REGISTER_FMU_CAPABILITY_SCRIPT,
      '1',
      key,
      encrypted,
      String(ttl),
    ])
    return
  }

  sweepMemory()
  const records = memoryCapabilities.get(normalizedSessionId) || new Map()
  records.set(encrypted, Date.now() + ttl * 1000)
  memoryCapabilities.set(normalizedSessionId, records)
}

export async function getFmuCapabilitiesForSession(sessionId) {
  const normalizedSessionId = normalizeSessionId(sessionId)
  sweepMemory()
  const values = redisEnabled()
    ? await redisCommand(['SMEMBERS', capabilityKey(normalizedSessionId)])
    : [...(memoryCapabilities.get(normalizedSessionId)?.keys() || [])]
  const now = Math.floor(Date.now() / 1000)
  return (Array.isArray(values) ? values : [])
    .map(decryptCapability)
    .filter((context) => context && Number(context.expiresAt) > now)
}

function validateRevocationContext(context) {
  if (!context || typeof context !== 'object') throw new Error('FMU capability context is required')
  const gatewayOrigin = new URL(context.gatewayOrigin).origin
  const resourceSessionId = String(context.resourceSessionId || '')
  const expiresAt = Number(context.expiresAt)
  if (!/^[A-Za-z0-9_-]{16,512}$/.test(resourceSessionId)) {
    throw new Error('FMU resource session ID is invalid')
  }
  if (!Number.isSafeInteger(expiresAt) || expiresAt < 1) {
    throw new Error('FMU capability expiration is invalid')
  }
  return { ...context, gatewayOrigin, resourceSessionId, expiresAt }
}

function revocationRecord({ sessionId, context, attempts = 0, nextAttemptAt }) {
  return {
    sessionId: normalizeSessionId(sessionId),
    context: validateRevocationContext(context),
    attempts: Number.isSafeInteger(attempts) && attempts >= 0 ? attempts : 0,
    nextAttemptAt: Number.isSafeInteger(nextAttemptAt) ? nextAttemptAt : Math.floor(Date.now() / 1000),
  }
}

export async function enqueueFmuRevocation({ sessionId, context, now = Date.now() }) {
  const record = revocationRecord({ sessionId, context })
  const nowSeconds = Math.floor(Number(now) / 1000)
  if (!Number.isSafeInteger(nowSeconds) || record.context.expiresAt <= nowSeconds) return false

  const member = revocationMember(record.sessionId, record.context)
  const ttlSeconds = Math.max(1, record.context.expiresAt - nowSeconds)
  const encrypted = encryptCapability(record)
  if (redisEnabled()) {
    await redisCommand([
      'EVAL',
      ENQUEUE_FMU_REVOCATION_SCRIPT,
      '2',
      revocationEntryKey(member),
      FMU_REVOCATION_OUTBOX_INDEX,
      encrypted,
      String(ttlSeconds),
      String(record.nextAttemptAt),
      member,
    ])
    return true
  }

  sweepMemory(Number(now))
  memoryRevocationOutbox.set(member, {
    record,
    expiresAt: Number(now) + ttlSeconds * 1000,
  })
  return true
}

export async function getDueFmuRevocations({ now = Date.now(), limit = 100 } = {}) {
  const nowSeconds = Math.floor(Number(now) / 1000)
  const boundedLimit = Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 500) : 100
  if (!Number.isSafeInteger(nowSeconds)) return []

  if (redisEnabled()) {
    const members = await redisCommand([
      'ZRANGEBYSCORE',
      FMU_REVOCATION_OUTBOX_INDEX,
      '-inf',
      String(nowSeconds),
      'LIMIT',
      '0',
      String(boundedLimit),
    ])
    const normalizedMembers = Array.isArray(members) ? members : []
    const values = normalizedMembers.length > 0
      ? await redisCommand(['MGET', ...normalizedMembers.map(revocationEntryKey)])
      : []
    const due = []
    for (const [index, member] of normalizedMembers.entries()) {
      const record = decryptCapability(values[index])
      if (record?.sessionId && record?.context) {
        due.push({ member, ...record })
      } else {
        await redisCommand(['ZREM', FMU_REVOCATION_OUTBOX_INDEX, member])
      }
    }
    return due
  }

  sweepMemory(Number(now))
  return [...memoryRevocationOutbox.entries()]
    .filter(([, entry]) => entry.record.nextAttemptAt <= nowSeconds)
    .slice(0, boundedLimit)
    .map(([member, entry]) => ({ member, ...entry.record }))
}

export async function ackFmuRevocation({ sessionId, context }) {
  const normalizedSessionId = normalizeSessionId(sessionId)
  const member = revocationMember(normalizedSessionId, context)
  if (redisEnabled()) {
    await redisCommand([
      'EVAL',
      ACK_FMU_REVOCATION_SCRIPT,
      '2',
      revocationEntryKey(member),
      FMU_REVOCATION_OUTBOX_INDEX,
      member,
    ])
    return
  }
  memoryRevocationOutbox.delete(member)
}

export async function rescheduleFmuRevocation({ sessionId, context, attempts = 0, now = Date.now() }) {
  const normalizedSessionId = normalizeSessionId(sessionId)
  const normalizedContext = validateRevocationContext(context)
  const nowSeconds = Math.floor(Number(now) / 1000)
  if (normalizedContext.expiresAt <= nowSeconds) return false
  const nextAttempts = Math.max(0, Number.isSafeInteger(attempts) ? attempts : 0) + 1
  const delay = Math.min(
    MAX_REVOCATION_RETRY_DELAY_SECONDS,
    30 * (2 ** Math.min(nextAttempts - 1, 4)),
  )
  const record = revocationRecord({
    sessionId: normalizedSessionId,
    context: normalizedContext,
    attempts: nextAttempts,
    nextAttemptAt: Math.min(normalizedContext.expiresAt, nowSeconds + delay),
  })
  const member = revocationMember(normalizedSessionId, normalizedContext)
  const ttlSeconds = Math.max(1, normalizedContext.expiresAt - nowSeconds)
  if (redisEnabled()) {
    await redisCommand([
      'EVAL',
      ENQUEUE_FMU_REVOCATION_SCRIPT,
      '2',
      revocationEntryKey(member),
      FMU_REVOCATION_OUTBOX_INDEX,
      encryptCapability(record),
      String(ttlSeconds),
      String(record.nextAttemptAt),
      member,
    ])
    return true
  }
  memoryRevocationOutbox.set(member, {
    record,
    expiresAt: Number(now) + ttlSeconds * 1000,
  })
  return true
}

export async function removeFmuCapabilityForSession(sessionId, context) {
  const normalizedSessionId = normalizeSessionId(sessionId)
  const expectedIdentity = capabilityIdentity(validateRevocationContext(context))
  const key = capabilityKey(normalizedSessionId)
  if (redisEnabled()) {
    const values = await redisCommand(['SMEMBERS', key])
    for (const value of Array.isArray(values) ? values : []) {
      const stored = decryptCapability(value)
      if (stored && capabilityIdentity(stored) === expectedIdentity) {
        await redisCommand(['SREM', key, value])
      }
    }
    return
  }
  sweepMemory()
  const records = memoryCapabilities.get(normalizedSessionId)
  if (!records) return
  for (const value of records.keys()) {
    const stored = decryptCapability(value)
    if (stored && capabilityIdentity(stored) === expectedIdentity) records.delete(value)
  }
  if (records.size === 0) memoryCapabilities.delete(normalizedSessionId)
}

export async function clearFmuCapabilitiesForSession(sessionId) {
  const normalizedSessionId = normalizeSessionId(sessionId)
  if (redisEnabled()) {
    await redisCommand(['DEL', capabilityKey(normalizedSessionId)])
    return
  }
  memoryCapabilities.delete(normalizedSessionId)
}

export function clearSamlSessionStateForTests() {
  memoryBindings.clear()
  memoryCapabilities.clear()
  memoryRevocationOutbox.clear()
}
