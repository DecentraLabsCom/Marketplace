import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto'
import { hasRedisConfig, redisCommand } from '@/utils/redis/restClient'

export const IC2IS2_DEVICE_AUTH_TTL_SECONDS = 600
const RECORD_VERSION = 2

const USER_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const DEFAULT_DEV_SECRET = 'dev-only-session-secret-not-for-production-use-32chars'
const memoryRecords = new Map()
const memoryUserCodes = new Map()
const memoryClaims = new Map()

function pruneMemoryState(now = Date.now()) {
  for (const [key, entry] of memoryRecords) {
    if (entry.expiresAtMs <= now) memoryRecords.delete(key)
  }
  for (const [key, entry] of memoryUserCodes) {
    if (entry.expiresAtMs <= now) memoryUserCodes.delete(key)
  }
  for (const [key, entry] of memoryClaims) {
    if (entry.expiresAtMs <= now) memoryClaims.delete(key)
  }
}

const CREATE_AUTHORIZATION_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 1 or redis.call('EXISTS', KEYS[2]) == 1 then
  return 0
end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
redis.call('SET', KEYS[2], ARGV[3], 'EX', ARGV[2])
return 1
`

const COMPLETE_AUTHORIZATION_SCRIPT = `
if redis.call('GET', KEYS[3]) ~= ARGV[3] then return -1 end
if redis.call('EXISTS', KEYS[1]) == 0 then
  redis.call('DEL', KEYS[3])
  return 0
end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
redis.call('DEL', KEYS[2], KEYS[3])
return 1
`

const RELEASE_CLAIM_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`

const CONSUME_DEVICE_SCRIPT = `
local value = redis.call('GET', KEYS[1])
if value then redis.call('DEL', KEYS[1]) end
return value
`

function encryptionKey() {
  const configuredSecret = process.env.SESSION_SECRET
  if (!configuredSecret && process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET is required for IC2IS2 device authorization')
  }
  const secret = configuredSecret || DEFAULT_DEV_SECRET
  if (secret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters long')
  return createHash('sha256').update('ic2is2-device-state\0').update(secret).digest()
}

function lookupHash(value, purpose) {
  return createHmac('sha256', encryptionKey())
    .update(`ic2is2-device-${purpose}\0`)
    .update(value)
    .digest('hex')
}

function deviceKey(deviceCodeHash) {
  return `marketplace:ic2is2:device:${deviceCodeHash}`
}

function userCodeKey(userCodeHash) {
  return `marketplace:ic2is2:user-code:${userCodeHash}`
}

function claimKey(deviceCodeHash) {
  return `marketplace:ic2is2:approval-lock:${deviceCodeHash}`
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
    const encoded = String(value || '')
    if (!encoded || encoded.length % 4 === 1 || !/^[A-Za-z0-9_-]+$/.test(encoded)) return null
    const packed = Buffer.from(encoded, 'base64url')
    if (packed.toString('base64url') !== encoded || packed.length <= 28) return null
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), packed.subarray(0, 12))
    decipher.setAuthTag(packed.subarray(12, 28))
    const plaintext = Buffer.concat([
      decipher.update(packed.subarray(28)),
      decipher.final(),
    ])
    const parsed = JSON.parse(plaintext.toString('utf8'))
    return parsed?.version === RECORD_VERSION ? parsed : null
  } catch {
    return null
  }
}

function assertStoreAvailable() {
  if (!hasRedisConfig() && process.env.NODE_ENV === 'production') {
    throw new Error('Redis is required for IC2IS2 device authorization')
  }
}

function makeUserCode() {
  const bytes = randomBytes(8)
  let value = ''
  for (const byte of bytes) value += USER_CODE_ALPHABET[byte & 31]
  return `${value.slice(0, 4)}-${value.slice(4)}`
}

export function normalizeIc2is2UserCode(value) {
  return String(value || '').toUpperCase().replace(/[\s-]/g, '')
}

export function hashIc2is2DeviceCode(value) {
  return lookupHash(value, 'device-code')
}

export function hashIc2is2UserCode(value) {
  return lookupHash(normalizeIc2is2UserCode(value), 'user-code')
}

export async function createIc2is2DeviceAuthorization({ capability, labId, reservationKey, codeChallenge }) {
  assertStoreAvailable()
  const now = Math.floor(Date.now() / 1000)
  pruneMemoryState()

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const deviceCode = randomBytes(32).toString('base64url')
    const userCode = makeUserCode()
    const deviceCodeHash = hashIc2is2DeviceCode(deviceCode)
    const userCodeHash = hashIc2is2UserCode(userCode)
    const record = {
      version: RECORD_VERSION,
      status: 'pending',
      capability,
      labId: String(labId),
      reservationKey,
      codeChallenge,
      deviceCodeHash,
      userCodeHash,
      createdAt: now,
      expiresAt: now + IC2IS2_DEVICE_AUTH_TTL_SECONDS,
    }
    const encrypted = encryptRecord(record)

    if (hasRedisConfig()) {
      const result = await redisCommand([
        'EVAL', CREATE_AUTHORIZATION_SCRIPT, '2',
        deviceKey(deviceCodeHash), userCodeKey(userCodeHash),
        encrypted, String(IC2IS2_DEVICE_AUTH_TTL_SECONDS), deviceCodeHash,
      ])
      if (Number(result) === 1) return { deviceCode, userCode }
    } else {
      const existing = memoryRecords.get(deviceCodeHash)
      const mapped = memoryUserCodes.get(userCodeHash)
      if (!existing && !mapped) {
        const expiresAtMs = (now + IC2IS2_DEVICE_AUTH_TTL_SECONDS) * 1000
        memoryRecords.set(deviceCodeHash, { encrypted, expiresAtMs })
        memoryUserCodes.set(userCodeHash, { deviceCodeHash, expiresAtMs })
        return { deviceCode, userCode }
      }
    }
  }

  throw new Error('Unable to allocate a unique IC2IS2 device authorization')
}

async function readEncryptedDeviceRecord(deviceCodeHash) {
  assertStoreAvailable()
  if (hasRedisConfig()) return await redisCommand(['GET', deviceKey(deviceCodeHash)])
  const entry = memoryRecords.get(deviceCodeHash)
  if (!entry || entry.expiresAtMs <= Date.now()) {
    memoryRecords.delete(deviceCodeHash)
    return null
  }
  return entry.encrypted
}

export async function readIc2is2DeviceAuthorization(deviceCodeHash) {
  const encrypted = await readEncryptedDeviceRecord(deviceCodeHash)
  const record = decryptRecord(encrypted)
  if (!record || Number(record.expiresAt) <= Math.floor(Date.now() / 1000)) return null
  return record
}

export async function readIc2is2AuthorizationByUserCode(userCodeHash) {
  assertStoreAvailable()
  let mappedDeviceCodeHash
  if (hasRedisConfig()) {
    mappedDeviceCodeHash = await redisCommand(['GET', userCodeKey(userCodeHash)])
  } else {
    const entry = memoryUserCodes.get(userCodeHash)
    if (entry?.expiresAtMs > Date.now()) mappedDeviceCodeHash = entry.deviceCodeHash
    else memoryUserCodes.delete(userCodeHash)
  }
  if (typeof mappedDeviceCodeHash !== 'string' || !/^[a-f0-9]{64}$/.test(mappedDeviceCodeHash)) return null
  const record = await readIc2is2DeviceAuthorization(mappedDeviceCodeHash)
  return record ? { deviceCodeHash: mappedDeviceCodeHash, record } : null
}

export async function claimIc2is2DeviceAuthorization(deviceCodeHash, claimToken) {
  assertStoreAvailable()
  if (hasRedisConfig()) {
    const result = await redisCommand([
      'SET', claimKey(deviceCodeHash), claimToken, 'EX', '90', 'NX',
    ])
    return result === 'OK'
  }
  const current = memoryClaims.get(deviceCodeHash)
  if (current && current.expiresAtMs > Date.now()) return false
  memoryClaims.set(deviceCodeHash, { claimToken, expiresAtMs: Date.now() + 90_000 })
  return true
}

export async function completeIc2is2DeviceAuthorization({ deviceCodeHash, claimToken, record, ttlSeconds }) {
  assertStoreAvailable()
  const encrypted = encryptRecord(record)
  if (hasRedisConfig()) {
    const result = await redisCommand([
      'EVAL', COMPLETE_AUTHORIZATION_SCRIPT, '3',
      deviceKey(deviceCodeHash), userCodeKey(record.userCodeHash), claimKey(deviceCodeHash),
      encrypted, String(ttlSeconds), claimToken,
    ])
    return Number(result) === 1
  }

  const claim = memoryClaims.get(deviceCodeHash)
  const current = memoryRecords.get(deviceCodeHash)
  if (!claim || claim.claimToken !== claimToken || claim.expiresAtMs <= Date.now() || !current) return false
  memoryRecords.set(deviceCodeHash, { encrypted, expiresAtMs: Date.now() + ttlSeconds * 1000 })
  memoryUserCodes.delete(record.userCodeHash)
  memoryClaims.delete(deviceCodeHash)
  return true
}

export async function releaseIc2is2DeviceAuthorizationClaim(deviceCodeHash, claimToken) {
  if (hasRedisConfig()) {
    await redisCommand(['EVAL', RELEASE_CLAIM_SCRIPT, '1', claimKey(deviceCodeHash), claimToken])
    return
  }
  const claim = memoryClaims.get(deviceCodeHash)
  if (claim?.claimToken === claimToken) memoryClaims.delete(deviceCodeHash)
}

export async function consumeIc2is2DeviceAuthorization(deviceCodeHash) {
  assertStoreAvailable()
  if (hasRedisConfig()) {
    const value = await redisCommand(['EVAL', CONSUME_DEVICE_SCRIPT, '1', deviceKey(deviceCodeHash)])
    return decryptRecord(value)
  }
  const entry = memoryRecords.get(deviceCodeHash)
  memoryRecords.delete(deviceCodeHash)
  if (!entry || entry.expiresAtMs <= Date.now()) return null
  const record = decryptRecord(entry.encrypted)
  if (record?.userCodeHash) memoryUserCodes.delete(record.userCodeHash)
  return record
}
