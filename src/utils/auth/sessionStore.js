import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import devLog from '@/utils/dev/logger'
import { MARKETPLACE_SESSION_TTL_SECONDS } from './sessionConfig'

const SESSION_KEY_PREFIX = 'marketplace:session:'
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/
const ENCRYPTED_VALUE_PREFIX = 'enc:v1:'
const memorySessions = new Map()
const developmentEncryptionKey = randomBytes(32)
let remoteFailureCount = 0
let remoteCircuitOpenUntil = 0

export class SessionStoreUnavailableError extends Error {
  constructor() {
    super('Session store is temporarily unavailable')
    this.name = 'SessionStoreUnavailableError'
    this.code = 'SESSION_STORE_UNAVAILABLE'
  }
}

const parseBoundedInteger = (value, fallback, minimum, maximum) => {
  const parsed = Number.parseInt(value || '', 10)
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback
}

const remoteRequestTimeoutMs = () => parseBoundedInteger(
  process.env.SESSION_STORE_TIMEOUT_MS,
  2_000,
  100,
  10_000,
)

const remoteRequestAttempts = () => parseBoundedInteger(
  process.env.SESSION_STORE_MAX_ATTEMPTS,
  2,
  1,
  3,
)

const circuitFailureThreshold = () => parseBoundedInteger(
  process.env.SESSION_STORE_CIRCUIT_FAILURES,
  3,
  1,
  10,
)

const circuitCooldownMs = () => parseBoundedInteger(
  process.env.SESSION_STORE_CIRCUIT_COOLDOWN_MS,
  30_000,
  1_000,
  5 * 60_000,
)

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
  return { encryptedSession: encryptSensitiveValue(JSON.stringify(sessionData)) }
}

function unprotectSessionData(record) {
  if (typeof record?.encryptedSession !== 'string') throw new Error('Session record is missing encrypted identity data')
  const payload = JSON.parse(decryptSensitiveValue(record.encryptedSession))
  if (!payload || typeof payload !== 'object') throw new Error('Session identity payload is invalid')
  return payload
}

async function sendRemoteCommand(command, config) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), remoteRequestTimeoutMs())
  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) {
      const error = new Error('Session store request failed')
      error.retryable = response.status >= 500 || response.status === 429
      throw error
    }
    const payload = await response.json().catch(() => ({}))
    if (payload.error) {
      const error = new Error('Session store rejected the request')
      error.retryable = false
      throw error
    }
    return payload.result
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('Session store request timed out')
      timeoutError.retryable = true
      throw timeoutError
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function recordRemoteFailure(now) {
  remoteFailureCount += 1
  if (remoteFailureCount >= circuitFailureThreshold()) {
    remoteCircuitOpenUntil = now + circuitCooldownMs()
  }
}

async function remoteCommand(command, config) {
  if (Date.now() < remoteCircuitOpenUntil) {
    throw new Error('Session store is temporarily unavailable')
  }

  const attempts = remoteRequestAttempts()
  let lastError
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await sendRemoteCommand(command, config)
      remoteFailureCount = 0
      remoteCircuitOpenUntil = 0
      return result
    } catch (error) {
      lastError = error
      if (error?.retryable === false) break
    }
  }

  recordRemoteFailure(Date.now())
  devLog.warn('Session store command failed', lastError?.message || lastError)
  throw new Error('Session store is temporarily unavailable')
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

export async function createServerSession(sessionData, maxAgeSec = MARKETPLACE_SESSION_TTL_SECONDS) {
  requireValidSessionData(sessionData)
  let ttl = Number(maxAgeSec)
  if (!Number.isSafeInteger(ttl) || ttl <= 0) throw new Error('Invalid session TTL')

  const sessionId = buildSessionId()
  const now = Date.now()
  const expiresAt = now + ttl * 1000
  const record = protectSessionData({
    ...sessionData,
    sessionId,
    createdAt: now,
    expiresAt,
  })
  const config = requireSessionStoreConfig()

  if (config) {
    await remoteCommand(['SET', sessionKey(sessionId), JSON.stringify(record), 'EX', String(ttl)], config)
  } else {
    sweepMemorySessions(now)
    memorySessions.set(sessionId, { record, expiresAt })
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
    throw new SessionStoreUnavailableError()
  }
  let rawRecord

  try {
    rawRecord = config
      ? await remoteCommand(['GET', sessionKey(sessionId)], config)
      : memorySessions.get(sessionId)?.record
  } catch (error) {
    devLog.warn('Session store read failed; rejecting session', error?.message || error)
    throw new SessionStoreUnavailableError()
  }

  if (!rawRecord) return null
  try {
    const record = typeof rawRecord === 'string' ? JSON.parse(rawRecord) : rawRecord
    const session = unprotectSessionData(record)
    if (!record || session.sessionId !== sessionId || session.expiresAt <= Date.now()) {
      if (!config) memorySessions.delete(sessionId)
      return null
    }
    return session
  } catch (error) {
    if (!config) memorySessions.delete(sessionId)
    devLog.warn('Session record is invalid; rejecting session', error?.message || error)
    throw new SessionStoreUnavailableError()
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
  remoteFailureCount = 0
  remoteCircuitOpenUntil = 0
}
