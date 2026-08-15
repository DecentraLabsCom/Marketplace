import { createHash } from 'node:crypto'
import { hasRedisConfig, redisCommand } from '@/utils/redis/restClient'

const LOGIN_PREFIX = 'marketplace:saml:login:'
const RESPONSE_PREFIX = 'marketplace:saml:response:'
const ASSERTION_PREFIX = 'marketplace:saml:assertion:'
const DEFAULT_TTL_SECONDS = 10 * 60
const MAX_RETURN_TO_LENGTH = 2_048
const memoryRecords = new Map()

const hashKeyPart = (value) => createHash('sha256').update(value).digest('hex')
const keyFor = (prefix, value) => `${prefix}${hashKeyPart(value)}`
const loginKeyFor = (requestId, relayState) => keyFor(LOGIN_PREFIX, `${requestId}\u0000${relayState}`)

const normalizeValue = (value, maxLength = 512) => {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized && normalized.length <= maxLength ? normalized : null
}

export function normalizeSamlReturnTo(value) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (
    !normalized ||
    normalized.length > MAX_RETURN_TO_LENGTH ||
    !normalized.startsWith('/') ||
    normalized.startsWith('//') ||
    normalized.includes('\\')
  ) return null
  return normalized
}

const resolveTtlSeconds = () => {
  const configured = Number.parseInt(process.env.SAML_TRANSACTION_TTL_SECONDS || '', 10)
  if (Number.isSafeInteger(configured) && configured >= 60 && configured <= 30 * 60) return configured
  return DEFAULT_TTL_SECONDS
}

const shouldUseRemoteStore = () => process.env.NODE_ENV !== 'test' && hasRedisConfig()

const requireRemoteStoreInProduction = () => {
  if (process.env.NODE_ENV === 'production' && !hasRedisConfig()) {
    throw new Error('A distributed SAML transaction store is required in production')
  }
}

const sweepMemoryRecords = (now = Date.now()) => {
  for (const [key, record] of memoryRecords.entries()) {
    if (record.expiresAt <= now) memoryRecords.delete(key)
  }
}

export async function createSamlLoginTransaction({ requestId, relayState, returnTo }) {
  const normalizedRequestId = normalizeValue(requestId)
  const normalizedRelayState = normalizeValue(relayState)
  const normalizedReturnTo = normalizeSamlReturnTo(returnTo)
  if (!normalizedRequestId || !normalizedRelayState) throw new Error('Invalid SAML login transaction')

  requireRemoteStoreInProduction()
  const ttl = resolveTtlSeconds()
  const record = JSON.stringify({
    requestId: normalizedRequestId,
    ...(normalizedReturnTo ? { returnTo: normalizedReturnTo } : {}),
  })
  const key = loginKeyFor(normalizedRequestId, normalizedRelayState)
  if (shouldUseRemoteStore()) {
    const result = await redisCommand(['SET', key, record, 'NX', 'EX', String(ttl)])
    if (result !== 'OK') throw new Error('Could not persist SAML login transaction')
  } else {
    sweepMemoryRecords()
    memoryRecords.set(key, { value: record, expiresAt: Date.now() + ttl * 1000 })
  }
  return {
    requestId: normalizedRequestId,
    relayState: normalizedRelayState,
    returnTo: normalizedReturnTo,
    expiresAt: Date.now() + ttl * 1000,
  }
}

export async function consumeSamlLoginTransaction({ requestId, relayState }) {
  const normalizedRequestId = normalizeValue(requestId)
  const normalizedRelayState = normalizeValue(relayState)
  if (!normalizedRequestId || !normalizedRelayState) return null

  requireRemoteStoreInProduction()
  const key = loginKeyFor(normalizedRequestId, normalizedRelayState)
  let rawRecord
  if (shouldUseRemoteStore()) {
    rawRecord = await redisCommand(['GETDEL', key])
  } else {
    sweepMemoryRecords()
    const record = memoryRecords.get(key)
    memoryRecords.delete(key)
    rawRecord = record?.value || null
  }
  if (!rawRecord) return null
  try {
    const record = typeof rawRecord === 'string' ? JSON.parse(rawRecord) : rawRecord
    if (record?.requestId !== normalizedRequestId) return null
    return record
  } catch {
    return null
  }
}

async function consumeReplayIdentifier(prefix, identifier) {
  const normalizedIdentifier = normalizeValue(identifier)
  if (!normalizedIdentifier) return false

  requireRemoteStoreInProduction()
  const ttl = resolveTtlSeconds()
  const key = keyFor(prefix, normalizedIdentifier)
  if (shouldUseRemoteStore()) {
    return (await redisCommand(['SET', key, '1', 'NX', 'EX', String(ttl)])) === 'OK'
  }
  sweepMemoryRecords()
  if (memoryRecords.has(key)) return false
  memoryRecords.set(key, { value: '1', expiresAt: Date.now() + ttl * 1000 })
  return true
}

export function consumeSamlResponseId(responseId) {
  return consumeReplayIdentifier(RESPONSE_PREFIX, responseId)
}

export function consumeSamlAssertionId(assertionId) {
  return consumeReplayIdentifier(ASSERTION_PREFIX, assertionId)
}

export function clearSamlTransactionStoreForTests() {
  memoryRecords.clear()
}
