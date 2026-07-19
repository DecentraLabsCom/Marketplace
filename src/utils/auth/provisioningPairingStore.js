import { createHash, randomBytes, randomUUID } from 'crypto';
import { hasRedisConfig, redisCommand } from '@/utils/redis/restClient';

const DEFAULT_PAIRING_TTL_SECONDS = 10 * 60;
const MAX_PAIRING_TTL_SECONDS = 15 * 60;
const TRANSITION_PAIRING_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if not current then return -1 end
local record = cjson.decode(current)
if record.status ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'XX', 'KEEPTTL')
return 1
`;

function pairingKey(pairingId) {
  return `provisioning:pairing:${pairingId}`;
}

function challengeKey(challengeHash) {
  return `provisioning:pairing:challenge:${challengeHash}`;
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
    createdAt: new Date().toISOString(),
  };
  const ttl = ttlSeconds(expiresAt);
  const created = await redisCommand([
    'SET', pairingKey(pairingId), JSON.stringify(record), 'NX', 'EX', String(ttl),
  ]);
  if (created !== 'OK') throw new Error('Provisioning pairing could not be created');

  const indexed = await redisCommand([
    'SET', challengeKey(challengeHash), pairingId, 'NX', 'EX', String(ttl),
  ]);
  if (indexed !== 'OK') {
    await redisCommand(['DEL', pairingKey(pairingId)]).catch(() => {});
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

export async function transitionProvisioningPairing(pairingId, expectedStatus, patch) {
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
  const result = await redisCommand([
    'EVAL',
    TRANSITION_PAIRING_SCRIPT,
    '1',
    pairingKey(pairingId),
    expectedStatus,
    JSON.stringify(updated),
  ]);
  if (Number(result) !== 1) {
    const error = new Error('Provisioning pairing state has changed');
    error.status = 409;
    error.code = 'PAIRING_STATE_CHANGED';
    throw error;
  }
  return updated;
}

export function isProvisioningPairingExpired(pairing) {
  return !pairing || Number(pairing.expiresAt) <= Math.floor(Date.now() / 1000);
}

export function publicProvisioningPairing(pairing) {
  if (!pairing) return null;
  return {
    pairingId: pairing.pairingId,
    institutionId: pairing.institutionId,
    registrationType: pairing.registrationType,
    chainId: pairing.chainId,
    registryContract: pairing.registryContract,
    issuedAt: pairing.issuedAt,
    expiresAt: pairing.expiresAt,
    status: isProvisioningPairingExpired(pairing) ? 'EXPIRED' : pairing.status,
    walletAddress: pairing.walletAddress,
    canonicalBackendOrigin: pairing.canonicalBackendOrigin,
  };
}
