import { createHash } from 'node:crypto'
import { hasRedisConfig, redisCommand } from '@/utils/redis/restClient'

const MEMORY_PREFIX = 'marketplace:oidc:transaction:'
const memoryTransactions = new Map()

function shouldUseRemoteStore() {
  return process.env.NODE_ENV !== 'test' && hasRedisConfig()
}

function requireRemoteStoreInProduction() {
  if (process.env.NODE_ENV === 'production' && !hasRedisConfig()) {
    throw new Error('A distributed OIDC transaction store is required in production')
  }
}

function sweepMemoryTransactions(now = Date.now()) {
  for (const [key, transaction] of memoryTransactions.entries()) {
    if (transaction.expiresAt <= now) memoryTransactions.delete(key)
  }
}

function transactionKey(state) {
  return `${MEMORY_PREFIX}${createHash('sha256').update(String(state)).digest('hex')}`
}

function ttlSeconds(value) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 30 && parsed <= 900 ? parsed : 300
}

function normalizeTransaction(transaction) {
  if (!transaction || typeof transaction !== 'object') throw new Error('OIDC transaction is required')
  for (const field of ['state', 'nonce', 'codeVerifier', 'redirectUri', 'provider']) {
    if (typeof transaction[field] !== 'string' || !transaction[field].trim()) {
      throw new Error(`OIDC transaction ${field} is required`)
    }
  }
  return {
    state: transaction.state,
    nonce: transaction.nonce,
    codeVerifier: transaction.codeVerifier,
    redirectUri: transaction.redirectUri,
    provider: transaction.provider,
    expiresAt: Number(transaction.expiresAt),
  }
}

export async function saveOidcTransaction(transaction, ttl = process.env.OIDC_TRANSACTION_TTL_SECONDS) {
  requireRemoteStoreInProduction()
  const normalized = normalizeTransaction({
    ...transaction,
    expiresAt: Date.now() + ttlSeconds(ttl) * 1000,
  })
  const key = transactionKey(normalized.state)
  const serialized = JSON.stringify(normalized)
  if (shouldUseRemoteStore()) {
    const result = await redisCommand([
      'SET', key, serialized, 'NX', 'EX', String(ttlSeconds(ttl)),
    ])
    if (result !== 'OK') throw new Error('Could not persist OIDC transaction')
    return
  }
  sweepMemoryTransactions()
  memoryTransactions.set(key, normalized)
}

export async function consumeOidcTransaction(state, provider) {
  if (typeof state !== 'string' || !state.trim()) return null
  requireRemoteStoreInProduction()
  const key = transactionKey(state)
  let serialized
  if (shouldUseRemoteStore()) {
    serialized = await redisCommand(['GETDEL', key])
  } else {
    sweepMemoryTransactions()
    const transaction = memoryTransactions.get(key)
    memoryTransactions.delete(key)
    serialized = transaction ? JSON.stringify(transaction) : null
  }
  if (!serialized) return null

  let transaction
  try {
    transaction = normalizeTransaction(typeof serialized === 'string' ? JSON.parse(serialized) : serialized)
  } catch {
    return null
  }
  if (transaction.provider !== provider || transaction.state !== state || transaction.expiresAt <= Date.now()) return null
  return transaction
}

export function clearOidcTransactionStore() {
  memoryTransactions.clear()
}

export default {
  saveOidcTransaction,
  consumeOidcTransaction,
  clearOidcTransactionStore,
}
