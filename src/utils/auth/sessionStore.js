import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import devLog from '@/utils/dev/logger'

const SESSION_KEY_PREFIX = 'marketplace:session:'
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/
const ENCRYPTED_VALUE_PREFIX = 'enc:v1:'
const memorySessions = new Map()
const developmentEncryptionKey = randomBytes(32)

function getRemoteConfig() {
  const url = process.env.SESSION_STORE_REST_URL
    || process.env.KV_REST_API_URL
    || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.SESSION_STORE_REST_TOKEN
    || process.env.KV_REST_API_TOKEN
    || process.env.UPSTASH_REDIS_REST_TOKEN
  return { url: url?.replace(/\/+$/, ''), token }
}

function requireValidSessionData(sessionData) {
  if (!sessionData || typeof sessionData !== 'object') throw new Error('Session data is required')
  if (!sessionData.id && !sessionData.email) throw new Error('Session must contain at least id or email')
}

function requireSessionStoreConfig() {
  const config = getRemoteConfig()
  if (config.url && config.token) return config
  if (process.env.NODE_ENV === 'production') {
    throw new Error('A server-side session store is required in production')
  }
  return null
}

function getEncryptionKey() {
  const configured = process.env.SESSION_ENCRYPTION_KEY
    || process.env.SESSION_STORE_ENCRYPTION_KEY
    || process.env.SESSION_SECRET
  if (!configured) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('A server-side session encryption key is required in production')
    }
    return developmentEncryptionKey
  }

  if (/^[0-9a-f]{64}$/i.test(configured)) return Buffer.from(configured, 'hex')
  return createHash('sha256').update(configured).digest()
}

function encryptSensitiveValue(value) {
  if (typeof value !== 'string' || !value) return value
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${ENCRYPTED_VALUE_PREFIX}${iv.toString('base64url')}.${authTag.toString('base64url')}.${ciphertext.toString('base64url')}`
}

function decryptSensitiveValue(value) {
  if (typeof value !== 'string' || !value.startsWith(ENCRYPTED_VALUE_PREFIX)) return value
  const [ivValue, tagValue, ciphertextValue] = value.slice(ENCRYPTED_VALUE_PREFIX.length).split('.')
  if (!ivValue || !tagValue || !ciphertextValue) throw new Error('Invalid encrypted session field')
  const decipher = createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    Buffer.from(ivValue, 'base64url'),
  )
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

function protectSessionData(sessionData) {
  const protectedData = { ...sessionData }
  if (typeof protectedData.samlAssertion === 'string' && protectedData.samlAssertion) {
    protectedData.samlAssertion = encryptSensitiveValue(protectedData.samlAssertion)
  }
  return protectedData
}

function unprotectSessionData(record) {
  const sessionData = { ...record }
  if (typeof sessionData.samlAssertion === 'string') {
    sessionData.samlAssertion = decryptSensitiveValue(sessionData.samlAssertion)
  }
  return sessionData
}

async function remoteCommand(command, config) {
  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  })
  if (!response.ok) throw new Error(`Session store request failed with status ${response.status}`)
  const payload = await response.json().catch(() => ({}))
  if (payload.error) throw new Error('Session store rejected the request')
  return payload.result
}

function buildSessionId() {
  return randomBytes(32).toString('base64url')
}

function isValidSessionId(sessionId) {
  return typeof sessionId === 'string' && SESSION_ID_PATTERN.test(sessionId)
}

function sessionKey(sessionId) {
  return `${SESSION_KEY_PREFIX}${sessionId}`
}

function sweepMemorySessions(now = Date.now()) {
  for (const [sessionId, record] of memorySessions.entries()) {
    if (record.expiresAt <= now) memorySessions.delete(sessionId)
  }
  if (memorySessions.size > 10_000) {
    const oldest = [...memorySessions.entries()]
      .sort(([, left], [, right]) => left.createdAt - right.createdAt)
      .slice(0, memorySessions.size - 10_000)
    oldest.forEach(([sessionId]) => memorySessions.delete(sessionId))
  }
}

export async function createServerSession(sessionData, maxAgeSec = 60 * 60 * 24) {
  requireValidSessionData(sessionData)
  let ttl = Number(maxAgeSec)
  if (!Number.isSafeInteger(ttl) || ttl <= 0) throw new Error('Invalid session TTL')

  const assertionExpiresAt = Number(sessionData.samlExpiresAt)
  if (Number.isFinite(assertionExpiresAt)) {
    const assertionTtl = Math.floor((assertionExpiresAt - Date.now()) / 1000)
    if (assertionTtl <= 0) throw new Error('SAML assertion has expired')
    ttl = Math.min(ttl, assertionTtl)
  }

  const sessionId = buildSessionId()
  const now = Date.now()
  const record = {
    ...protectSessionData(sessionData),
    sessionId,
    createdAt: now,
    expiresAt: now + ttl * 1000,
  }
  const config = requireSessionStoreConfig()

  if (config) {
    await remoteCommand(['SET', sessionKey(sessionId), JSON.stringify(record), 'EX', String(ttl)], config)
  } else {
    sweepMemorySessions(now)
    memorySessions.set(sessionId, record)
    devLog.warn('Using an in-memory session store outside production; configure SESSION_STORE_REST_URL for shared sessions')
  }

  return { sessionId, record }
}

export async function getServerSession(sessionId) {
  if (!isValidSessionId(sessionId)) return null
  let config
  try {
    config = requireSessionStoreConfig()
  } catch (error) {
    devLog.warn('Session store configuration is invalid; rejecting session', error?.message || error)
    return null
  }
  let rawRecord

  try {
    rawRecord = config
      ? await remoteCommand(['GET', sessionKey(sessionId)], config)
      : memorySessions.get(sessionId)
  } catch (error) {
    devLog.warn('Session store read failed; rejecting session', error?.message || error)
    return null
  }

  if (!rawRecord) return null
  try {
    const record = typeof rawRecord === 'string' ? JSON.parse(rawRecord) : rawRecord
    if (!record || record.sessionId !== sessionId || record.expiresAt <= Date.now()) {
      if (!config) memorySessions.delete(sessionId)
      return null
    }
    return unprotectSessionData(record)
  } catch (error) {
    if (!config) memorySessions.delete(sessionId)
    devLog.warn('Session record is invalid; rejecting session', error?.message || error)
    return null
  }
}

export async function deleteServerSession(sessionId) {
  if (!isValidSessionId(sessionId)) return
  const config = requireSessionStoreConfig()
  if (config) {
    await remoteCommand(['DEL', sessionKey(sessionId)], config)
  } else {
    memorySessions.delete(sessionId)
  }
}

export function isServerSessionId(value) {
  return isValidSessionId(value)
}

export function clearMemorySessionsForTests() {
  memorySessions.clear()
}
