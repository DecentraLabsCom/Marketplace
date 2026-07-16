/**
 * Intent nonce resolution backed by the on-chain registry.
 * We no longer keep an in-memory counter because nonces must match the diamond's state.
 */
import { getContractInstance } from '@/app/api/contract/utils/contractInstance';
import { Wallet } from 'ethers'
import { randomUUID } from 'node:crypto'
import { hasRedisConfig, redisCommand } from '@/utils/redis/restClient'

const LOCK_PREFIX = 'marketplace:intent-signer-lock:'
const LOCK_TTL_MS = 120_000
const DEFAULT_LOCK_WAIT_MS = 5_000
const RENEW_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0
`
const RELEASE_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`

export class IntentSignerBusyError extends Error {
  constructor() {
    super('The intent signer is busy with another operation')
    this.name = 'IntentSignerBusyError'
    this.code = 'INTENT_SIGNER_BUSY'
    this.status = 409
  }
}

export class IntentSignerUnavailableError extends Error {
  constructor() {
    super('The intent signer coordination store is unavailable')
    this.name = 'IntentSignerUnavailableError'
    this.code = 'INTENT_SIGNER_COORDINATOR_UNAVAILABLE'
    this.status = 503
  }
}

export function getServerSignerAddress() {
  const privateKey = process.env.WALLET_PRIVATE_KEY
  if (!privateKey) {
    throw new IntentSignerUnavailableError('The server signer is not configured')
  }
  try {
    return new Wallet(privateKey).address.toLowerCase()
  } catch {
    throw new IntentSignerUnavailableError('The server signer is not configured')
  }
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

function lockKey(signerAddress) {
  return `${LOCK_PREFIX}${String(signerAddress).trim().toLowerCase()}`
}

function fenceKey(key) {
  return `${key}:fence`
}

async function releaseSignerLock(key, token) {
  try {
    await redisCommand(['EVAL', RELEASE_LOCK_SCRIPT, '1', key, token])
  } catch {
    // The TTL remains the safety net if release cannot complete.
  }
}

async function renewSignerLock(key, token, ttlMs) {
  try {
    return await redisCommand(['EVAL', RENEW_LOCK_SCRIPT, '1', key, token, String(ttlMs)]) === 1
  } catch {
    return false
  }
}

export async function withIntentSignerLock(signerAddress, callback, options = {}) {
  if (!signerAddress) throw new Error('signerAddress is required for intent coordination')
  const waitMs = Number.isFinite(Number(options.waitMs))
    ? Math.max(0, Number(options.waitMs))
    : DEFAULT_LOCK_WAIT_MS

  if (!hasRedisConfig()) {
    if (process.env.NODE_ENV === 'production') {
      throw new IntentSignerUnavailableError('Redis REST configuration is required for intent coordination')
    }
    return callback()
  }

  const key = lockKey(signerAddress)
  const deadline = Date.now() + waitMs
  let token
  let fencingToken

  while (true) {
    let acquired
    try {
      fencingToken = await redisCommand(['INCR', fenceKey(key)])
      token = `${randomUUID()}:${fencingToken}`
      acquired = await redisCommand([
        'SET', key, token, 'NX', 'PX', String(LOCK_TTL_MS),
      ])
    } catch {
      throw new IntentSignerUnavailableError()
    }

    if (acquired === 'OK') break
    if (Date.now() >= deadline) throw new IntentSignerBusyError()
    await sleep(Math.min(250, Math.max(25, deadline - Date.now())))
  }

  let leaseLost = false
  const renewalPeriodMs = Math.max(1_000, Math.floor(LOCK_TTL_MS / 3))
  const heartbeat = setInterval(async () => {
    if (leaseLost) return
    const renewed = await renewSignerLock(key, token, LOCK_TTL_MS)
    if (!renewed) leaseLost = true
  }, renewalPeriodMs)
  heartbeat.unref?.()

  const lease = {
    fencingToken: Number(fencingToken),
    async assertActive() {
      if (leaseLost) {
        throw new IntentSignerUnavailableError('The signer lease was lost while processing the operation')
      }
      const renewed = await renewSignerLock(key, token, LOCK_TTL_MS)
      if (!renewed) {
        leaseLost = true
        throw new IntentSignerUnavailableError('The signer lease was lost while processing the operation')
      }
    },
  }

  try {
    return await callback(lease)
  } catch (error) {
    if (typeof options.onError === 'function') {
      await options.onError(error, lease)
    }
    throw error
  } finally {
    clearInterval(heartbeat)
    await releaseSignerLock(key, token)
  }
}

export async function getNextIntentNonce(signerAddress) {
  if (!signerAddress) {
    throw new Error('signerAddress is required to fetch intent nonce');
  }
  const contract = await getContractInstance('diamond', true);
  const nonce = await contract.nextIntentNonce(signerAddress);
  return BigInt(nonce.toString());
}

export default {
  getNextIntentNonce,
  withIntentSignerLock,
};
