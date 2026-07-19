import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto'
import { hasRedisConfig, redisCommand } from '@/utils/redis/restClient'
import { isServerSessionId } from './sessionStore'

const SAML_BINDING_PREFIX = 'marketplace:saml:binding:'
const FMU_CAPABILITY_PREFIX = 'marketplace:fmu:capabilities:'
const MAX_BINDING_VALUE_LENGTH = 2048
const MAX_TTL_SECONDS = 7 * 24 * 60 * 60
const memoryBindings = new Map()
const memoryCapabilities = new Map()
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

export async function registerFmuCapabilityForSession({ sessionId, context, ttlSeconds }) {
  const normalizedSessionId = normalizeSessionId(sessionId)
  if (!context || typeof context !== 'object') throw new Error('FMU capability context is required')
  const ttl = normalizeTtl(ttlSeconds)
  const encrypted = encryptCapability(context)
  const key = capabilityKey(normalizedSessionId)

  if (redisEnabled()) {
    await redisCommand(['SADD', key, encrypted])
    await redisCommand(['EXPIRE', key, String(ttl)])
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
  return (Array.isArray(values) ? values : [])
    .map(decryptCapability)
    .filter(Boolean)
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
}
