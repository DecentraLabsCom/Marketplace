/**
 * Intent nonce resolution backed by the on-chain registry.
 * We no longer keep an in-memory counter because nonces must match the diamond's state.
 */
import { getContractInstance } from '@/app/api/contract/utils/contractInstance';
import { randomUUID } from 'node:crypto'
import { hasRedisConfig, redisCommand } from '@/utils/redis/restClient'

const LOCK_PREFIX = 'marketplace:intent-signer-lock:'
const LOCK_TTL_MS = 120_000
const DEFAULT_LOCK_WAIT_MS = 5_000
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

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

function lockKey(signerAddress) {
  return `${LOCK_PREFIX}${String(signerAddress).trim().toLowerCase()}`
}

async function releaseSignerLock(key, token) {
  try {
    await redisCommand(['EVAL', RELEASE_LOCK_SCRIPT, '1', key, token])
  } catch {
    // The TTL remains the safety net if release cannot complete.
  }
}

export async function withIntentSignerLock(signerAddress, callback, options = {}) {
  if (!signerAddress) throw new Error('signerAddress is required for intent coordination')
  const waitMs = Number.isFinite(Number(options.waitMs))
    ? Math.max(0, Number(options.waitMs))
    : DEFAULT_LOCK_WAIT_MS

  if (!hasRedisConfig()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Redis REST configuration is required for intent coordination')
    }
    return callback()
  }

  const key = lockKey(signerAddress)
  const token = randomUUID()
  const deadline = Date.now() + waitMs

  while (true) {
    let acquired
    try {
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

  try {
    return await callback()
  } finally {
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
