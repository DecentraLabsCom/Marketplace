import { createHash } from 'node:crypto'
import { hasRedisConfig, redisCommand } from '@/utils/redis/restClient'

const LOGIN_PREFIX = 'marketplace:saml:login:'
const ASSERTION_PREFIX = 'marketplace:saml:assertion:'
const DEFAULT_TTL_SECONDS = 10 * 60
const memoryRecords = new Map()

const hashKeyPart = (value) => createHash('sha256').update(value).digest('hex')
const keyFor = (prefix, value) => `${prefix}${hashKeyPart(value)}`
const loginKeyFor = (requestId, relayState) => keyFor(LOGIN_PREFIX, `${requestId}\u0000${relayState}`)

const normalizeValue = (value, maxLength = 512) => {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized && normalized.length <= maxLength ? normalized : null
}

const resolveTtlSeconds = () => {
  const configured = Number.parseInt(process.env.SAML_TRANSACTION_TTL_SECONDS || '', 10)
  if (Number.isSafeInteger(configured) && configured >= 60 && configured <= 30 * 60) return configured
  return DEFAULT_TTL_SECONDS
}

const useRemoteStore = () => process.env.NODE_ENV !== 'test' && hasRedisConfig()

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

export async function createSamlLoginTransaction({ requestId, relayState }) {
  const normalizedRequestId = normalizeValue(requestId)
  const normalizedRelayState = normalizeValue(relayState)
  if (!normalizedRequestId || !normalizedRelayState) throw new Error('Invalid SAML login transaction')

  requireRemoteStoreInProduction()
  const ttl = resolveTtlSeconds()
  const record = JSON.stringify({ requestId: normalizedRequestId })
  const key = loginKeyFor(normalizedRequestId, normalizedRelayState)
  if (useRemoteStore()) {
    const result = await redisCommand(['SET', key, record, 'NX', 'EX', String(ttl)])
    if (result !== 'OK') throw new Error('Could not persist SAML login transaction')
  } else {
    sweepMemoryRecords()
    memoryRecords.set(key, { value: record, expiresAt: Date.now() + ttl * 1000 })
  }
  return { requestId: normalizedRequestId, relayState: normalizedRelayState, expiresAt: Date.now() + ttl * 1000 }
}

export async function consumeSamlLoginTransaction({ requestId, relayState }) {
  const normalizedRequestId = normalizeValue(requestId)
  const normalizedRelayState = normalizeValue(relayState)
  if (!normalizedRequestId || !normalizedRelayState) return null

  requireRemoteStoreInProduction()
  const key = loginKeyFor(normalizedRequestId, normalizedRelayState)
  let rawRecord
  if (useRemoteStore()) {
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

export async function consumeSamlAssertionId(assertionId) {
  const normalizedAssertionId = normalizeValue(assertionId)
  if (!normalizedAssertionId) return false

  requireRemoteStoreInProduction()
  const ttl = resolveTtlSeconds()
  const key = keyFor(ASSERTION_PREFIX, normalizedAssertionId)
  if (useRemoteStore()) {
    return (await redisCommand(['SET', key, '1', 'NX', 'EX', String(ttl)])) === 'OK'
  }
  sweepMemoryRecords()
  if (memoryRecords.has(key)) return false
  memoryRecords.set(key, { value: '1', expiresAt: Date.now() + ttl * 1000 })
  return true
}

export function clearSamlTransactionStoreForTests() {
  memoryRecords.clear()
}
