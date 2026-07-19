import { createHash, randomBytes, randomUUID } from 'crypto';
import { hasRedisConfig, redisCommand } from '@/utils/redis/restClient';

const DEFAULT_PAIRING_TTL_SECONDS = 10 * 60;
const MAX_PAIRING_TTL_SECONDS = 15 * 60;
const ACTIVE_PAIRING_PREFIX = 'provisioning:pairing:active:';
const TRANSITION_PAIRING_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if not current then return -1 end
local record = cjson.decode(current)
if record.status ~= ARGV[1] then return 0 end
local retention_ttl = tonumber(ARGV[3] or '0') or 0
if retention_ttl > 0 then
  redis.call('SET', KEYS[1], ARGV[2], 'XX', 'EX', ARGV[3])
  if #KEYS > 1 then redis.call('EXPIRE', KEYS[2], ARGV[3]) end
  if #KEYS > 2 then redis.call('EXPIRE', KEYS[3], ARGV[3]) end
else
  redis.call('SET', KEYS[1], ARGV[2], 'XX', 'KEEPTTL')
end
return 1
`;
const REDEEM_PAIRING_TOKEN_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if not current then return -1 end
local record = cjson.decode(current)
if record.status ~= 'APPROVED' or not record.token then return 0 end
local redemption = {
  token = record.token,
  payload = record.tokenPayload,
  expiresAt = record.tokenPayload and record.tokenPayload.expiresAt
}
record.status = 'TOKEN_RETRIEVED'
record.token = nil
record.tokenPayload = nil
record.tokenHash = ARGV[1]
record.tokenJti = ARGV[2]
record.tokenRetrievedAt = ARGV[3]
record.updatedAt = ARGV[3]
redis.call('SET', KEYS[1], cjson.encode(record), 'XX', 'KEEPTTL')
if #KEYS > 1 then redis.call('DEL', KEYS[2]) end
if #KEYS > 2 then redis.call('DEL', KEYS[3]) end
return cjson.encode(redemption)
`;
const CANCEL_PAIRING_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if not current then return -1 end
local record = cjson.decode(current)
if record.status ~= 'AWAITING_BACKEND' and record.status ~= 'AWAITING_APPROVAL' then return 0 end
record.status = 'CANCELLED'
record.cancelledAt = ARGV[1]
record.updatedAt = ARGV[1]
redis.call('SET', KEYS[1], cjson.encode(record), 'XX', 'KEEPTTL')
if #KEYS > 1 then redis.call('DEL', KEYS[2]) end
if #KEYS > 2 then redis.call('DEL', KEYS[3]) end
return 1
`;

function pairingKey(pairingId) {
  return `provisioning:pairing:${pairingId}`;
}

function challengeKey(challengeHash) {
  return `provisioning:pairing:challenge:${challengeHash}`;
}

function activePairingKey(institutionId, registrationType) {
  const identity = `${String(institutionId).trim().toLowerCase()}\u0000${String(registrationType).trim().toLowerCase()}`;
  return `${ACTIVE_PAIRING_PREFIX}${createHash('sha256').update(identity).digest('hex')}`;
}

function hashChallenge(challenge) {
  return createHash('sha256').update(challenge).digest('hex');
}

function requireChallenge(challenge) {
  if (typeof challenge !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(challenge.trim())) {
    throw new Error('A valid pairing challenge is required');
  }
  return challenge.trim().toLowerCase();
}

function ttlSeconds(expiresAt) {
  const configured = Number.parseInt(process.env.PROVISIONING_PAIRING_TTL_SECONDS || '', 10);
  const configuredTtl = Number.isSafeInteger(configured) && configured > 0
    ? Math.min(configured, MAX_PAIRING_TTL_SECONDS)
    : DEFAULT_PAIRING_TTL_SECONDS;
  const remaining = Number(expiresAt) - Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(Number(expiresAt)) || remaining <= 0) {
    throw new Error('Provisioning pairing expiration must be in the future');
  }
  return Math.max(1, Math.min(configuredTtl, remaining));
}

function retentionTtlSeconds(expiresAt) {
  const remaining = Number(expiresAt) - Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(Number(expiresAt)) || remaining <= 0) {
    throw new Error('Provisioning token expiration must be in the future');
  }
  return Math.max(1, Math.min(MAX_PAIRING_TTL_SECONDS, remaining));
}

function parseRecord(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error('Provisioning pairing record is malformed');
  }
}

function assertRedis() {
  if (!hasRedisConfig()) {
    throw new Error('Redis is required for provisioning pairing coordination');
  }
}

export async function createProvisioningPairing({
  institutionId,
  registrationType,
  issuedAt = Math.floor(Date.now() / 1000),
  expiresAt = issuedAt + DEFAULT_PAIRING_TTL_SECONDS,
  providerName,
  providerEmail,
  providerCountry,
  consumerName,
}) {
  assertRedis();
  const challenge = `0x${randomBytes(32).toString('hex')}`;
  const challengeHash = hashChallenge(challenge);
  const pairingId = randomUUID();
  const record = {
    pairingId,
    challengeHash,
    institutionId,
    registrationType,
    issuedAt,
    expiresAt,
    providerName: providerName || null,
    providerEmail: providerEmail || null,
    providerCountry: providerCountry || null,
    consumerName: consumerName || null,
    status: 'AWAITING_BACKEND',
    walletAddress: null,
    canonicalBackendOrigin: null,
    walletSignature: null,
    token: null,
    tokenPayload: null,
    activePairingKey: activePairingKey(institutionId, registrationType),
    createdAt: new Date().toISOString(),
  };
  const ttl = ttlSeconds(expiresAt);
  const active = await redisCommand([
    'SET', record.activePairingKey, pairingId, 'NX', 'EX', String(ttl),
  ]);
  if (active !== 'OK') {
    const error = new Error('An active provisioning pairing already exists for this institution and type');
    error.status = 409;
    error.code = 'ACTIVE_PAIRING_EXISTS';
    throw error;
  }
  const created = await redisCommand([
    'SET', pairingKey(pairingId), JSON.stringify(record), 'NX', 'EX', String(ttl),
  ]);
  if (created !== 'OK') {
    await redisCommand(['DEL', record.activePairingKey]).catch(() => {});
    throw new Error('Provisioning pairing could not be created');
  }

  const indexed = await redisCommand([
    'SET', challengeKey(challengeHash), pairingId, 'NX', 'EX', String(ttl),
  ]);
  if (indexed !== 'OK') {
    await redisCommand(['DEL', pairingKey(pairingId)]).catch(() => {});
    await redisCommand(['DEL', record.activePairingKey]).catch(() => {});
    throw new Error('Provisioning pairing challenge could not be indexed');
  }

  return { ...record, challenge };
}

export async function getProvisioningPairing(pairingId) {
  assertRedis();
  if (typeof pairingId !== 'string' || !pairingId.trim()) return null;
  return parseRecord(await redisCommand(['GET', pairingKey(pairingId.trim())]));
}

export async function getProvisioningPairingByChallenge(challenge) {
  assertRedis();
  const normalized = requireChallenge(challenge);
  const pairingId = await redisCommand(['GET', challengeKey(hashChallenge(normalized))]);
  if (typeof pairingId !== 'string' || !pairingId) return null;
  return getProvisioningPairing(pairingId);
}

export async function updateProvisioningPairing(pairingId, patch) {
  assertRedis();
  const current = await getProvisioningPairing(pairingId);
  if (!current) throw new Error('Provisioning pairing was not found');
  const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };
  const result = await redisCommand([
    'SET', pairingKey(pairingId), JSON.stringify(updated), 'XX', 'KEEPTTL',
  ]);
  if (result !== 'OK') throw new Error('Provisioning pairing could not be updated');
  return updated;
}

export async function transitionProvisioningPairing(pairingId, expectedStatus, patch, options = {}) {
  assertRedis();
  const current = await getProvisioningPairing(pairingId);
  if (!current) throw new Error('Provisioning pairing was not found');
  if (current.status !== expectedStatus) {
    const error = new Error('Provisioning pairing state has changed');
    error.status = 409;
    error.code = 'PAIRING_STATE_CHANGED';
    throw error;
  }

  const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };
  const retentionTtl = options.retentionExpiresAt
    ? retentionTtlSeconds(options.retentionExpiresAt)
    : 0;
  const keys = [pairingKey(pairingId)];
  if (retentionTtl > 0) {
    keys.push(challengeKey(current.challengeHash));
    keys.push(current.activePairingKey || activePairingKey(current.institutionId, current.registrationType));
  }
  const result = await redisCommand([
    'EVAL',
    TRANSITION_PAIRING_SCRIPT,
    String(keys.length),
    ...keys,
    expectedStatus,
    JSON.stringify(updated),
    String(retentionTtl),
  ]);
  if (Number(result) !== 1) {
    const error = new Error('Provisioning pairing state has changed');
    error.status = 409;
    error.code = 'PAIRING_STATE_CHANGED';
    throw error;
  }
  return updated;
}

export async function redeemProvisioningPairingToken(pairing) {
  assertRedis();
  if (!pairing?.pairingId || pairing.status !== 'APPROVED' || !pairing.token) {
    const error = new Error('Provisioning pairing token is no longer available');
    error.status = 409;
    error.code = 'PAIRING_TOKEN_UNAVAILABLE';
    throw error;
  }

  const retrievedAt = new Date().toISOString();
  const tokenHash = createHash('sha256').update(pairing.token).digest('hex');
  const keys = [pairingKey(pairing.pairingId)];
  if (pairing.challengeHash) keys.push(challengeKey(pairing.challengeHash));
  keys.push(pairing.activePairingKey || activePairingKey(pairing.institutionId, pairing.registrationType));
  const raw = await redisCommand([
    'EVAL',
    REDEEM_PAIRING_TOKEN_SCRIPT,
    String(keys.length),
    ...keys,
    tokenHash,
    pairing.tokenPayload?.jti || '',
    retrievedAt,
  ]);
  if (Number(raw) === -1) {
    const error = new Error('Provisioning pairing was not found');
    error.status = 410;
    error.code = 'PAIRING_NOT_FOUND';
    throw error;
  }
  if (Number(raw) === 0) {
    const error = new Error('Provisioning pairing token is no longer available');
    error.status = 409;
    error.code = 'PAIRING_TOKEN_UNAVAILABLE';
    throw error;
  }
  return parseRecord(raw);
}

export async function cancelProvisioningPairing(pairingId) {
  assertRedis();
  const pairing = await getProvisioningPairing(pairingId);
  if (!pairing) {
    const error = new Error('Provisioning pairing was not found');
    error.status = 404;
    error.code = 'PAIRING_NOT_FOUND';
    throw error;
  }
  const keys = [pairingKey(pairingId)];
  if (pairing.challengeHash) keys.push(challengeKey(pairing.challengeHash));
  keys.push(pairing.activePairingKey || activePairingKey(pairing.institutionId, pairing.registrationType));
  const result = await redisCommand([
    'EVAL',
    CANCEL_PAIRING_SCRIPT,
    String(keys.length),
    ...keys,
    new Date().toISOString(),
  ]);
  if (Number(result) !== 1) {
    const error = new Error('Provisioning pairing cannot be cancelled in its current state');
    error.status = 409;
    error.code = 'PAIRING_STATE_CHANGED';
    throw error;
  }
}

export function isProvisioningPairingExpired(pairing) {
  return !pairing || Number(pairing.expiresAt) <= Math.floor(Date.now() / 1000);
}

export function publicProvisioningPairing(pairing) {
  if (!pairing) return null;
  const pairingExpired = ['AWAITING_BACKEND', 'AWAITING_APPROVAL'].includes(pairing.status)
    && Number(pairing.expiresAt) <= Math.floor(Date.now() / 1000);
  return {
    pairingId: pairing.pairingId,
    institutionId: pairing.institutionId,
    registrationType: pairing.registrationType,
    chainId: pairing.chainId,
    registryContract: pairing.registryContract,
    issuedAt: pairing.issuedAt,
    expiresAt: pairing.expiresAt,
    pairingExpiresAt: pairing.pairingExpiresAt || pairing.expiresAt,
    tokenExpiresAt: pairing.tokenExpiresAt || null,
    status: pairingExpired ? 'EXPIRED' : pairing.status,
    walletAddress: pairing.walletAddress,
    canonicalBackendOrigin: pairing.canonicalBackendOrigin,
  };
}
