import { hasRedisConfig, redisCommand } from '@/utils/redis/restClient';

const DEFAULT_AUDIT_RETENTION_SECONDS = 365 * 24 * 60 * 60;

export const PROVISIONING_SAGA_STAGES = Object.freeze({
  WALLET_VERIFIED: 'WALLET_VERIFIED',
  PROVIDER_ADDED: 'PROVIDER_ADDED',
  INSTITUTION_ROLE_GRANTED: 'INSTITUTION_ROLE_GRANTED',
  BACKEND_REGISTERED: 'BACKEND_REGISTERED',
  ACTIVE: 'ACTIVE',
  FAILED: 'FAILED',
});

export class ProvisioningReplayError extends Error {
  constructor(message = 'Provisioning token has already been consumed') {
    super(message);
    this.name = 'ProvisioningReplayError';
    this.code = 'PROVISIONING_TOKEN_CONSUMED';
  }
}

function getRetentionSeconds(claims) {
  const configured = Number.parseInt(
    process.env.PROVISIONING_AUDIT_RETENTION_SECONDS || '',
    10
  );
  const auditRetention = Number.isSafeInteger(configured) && configured > 0
    ? configured
    : DEFAULT_AUDIT_RETENTION_SECONDS;
  const tokenLifetime = Math.max(60, Number(claims.expiresAt || 0) - Math.floor(Date.now() / 1000) + 60);
  return Math.max(auditRetention, tokenLifetime);
}

function buildAuditRecord(claims) {
  return {
    status: 'consumed',
    jti: claims.jti,
    institutionId: claims.institutionId,
    walletAddress: claims.walletAddress,
    canonicalBackendOrigin: claims.canonicalBackendOrigin,
    registrationType: claims.registrationType,
    chainId: claims.chainId,
    registryContract: claims.registryContract,
    nonce: claims.nonce,
    issuedAt: claims.issuedAt,
    expiresAt: claims.expiresAt,
    responsiblePerson: claims.responsiblePerson || null,
    responsibleEmail: claims.responsibleEmail || null,
    issuedBy: claims.issuedBy || null,
    consumedAt: new Date().toISOString(),
  };
}

function provisioningKey(jti) {
  return `provisioning:jti:${jti}`;
}

function buildSagaRecord(claims) {
  return {
    ...buildAuditRecord(claims),
    status: 'IN_PROGRESS',
    stage: PROVISIONING_SAGA_STAGES.WALLET_VERIFIED,
    lastConfirmedStage: PROVISIONING_SAGA_STAGES.WALLET_VERIFIED,
    startedAt: new Date().toISOString(),
  };
}

function hasMatchingImmutableClaims(record, claims) {
  return [
    'jti',
    'institutionId',
    'walletAddress',
    'canonicalBackendOrigin',
    'registrationType',
    'chainId',
    'registryContract',
    'nonce',
  ].every((key) => String(record?.[key] ?? '').toLowerCase() === String(claims?.[key] ?? '').toLowerCase());
}

export async function consumeProvisioningJti(claims) {
  if (!hasRedisConfig()) {
    throw new Error('Redis is required for provisioning token consumption');
  }

  const key = provisioningKey(claims.jti);
  const result = await redisCommand([
    'SET',
    key,
    JSON.stringify(buildAuditRecord(claims)),
    'NX',
    'EX',
    String(getRetentionSeconds(claims)),
  ]);

  if (result !== 'OK') {
    throw new ProvisioningReplayError();
  }

  return key;
}

/**
 * Creates a durable provisioning saga or returns the existing saga for the
 * same signed claims. A retry of the same valid token therefore resumes from
 * on-chain reconciliation instead of creating another registration attempt.
 */
export async function startOrResumeProvisioningSaga(claims) {
  if (!hasRedisConfig()) {
    throw new Error('Redis is required for provisioning saga coordination');
  }

  const key = provisioningKey(claims.jti);
  const initialRecord = buildSagaRecord(claims);
  const created = await redisCommand([
    'SET',
    key,
    JSON.stringify(initialRecord),
    'NX',
    'EX',
    String(getRetentionSeconds(claims)),
  ]);

  if (created === 'OK') {
    return { record: initialRecord, resumed: false };
  }

  const existing = await redisCommand(['GET', key]);
  if (typeof existing !== 'string' || !existing) {
    throw new Error('Provisioning saga record was not found after a contention response');
  }

  let record;
  try {
    record = JSON.parse(existing);
  } catch {
    throw new Error('Provisioning saga record is malformed');
  }
  if (!hasMatchingImmutableClaims(record, claims)) {
    throw new ProvisioningReplayError('Provisioning token conflicts with an existing saga');
  }

  return { record, resumed: true };
}

/**
 * Records a confirmed saga transition while the signer lease is held.
 */
export async function advanceProvisioningSaga(jti, patch) {
  if (!hasRedisConfig()) {
    throw new Error('Redis is required for provisioning saga updates');
  }
  const key = provisioningKey(jti);
  const existing = await redisCommand(['GET', key]);
  if (typeof existing !== 'string' || !existing) {
    throw new Error('Provisioning saga record was not found');
  }

  let record;
  try {
    record = JSON.parse(existing);
  } catch {
    throw new Error('Provisioning saga record is malformed');
  }
  const stage = patch.stage || record.stage;
  const updated = {
    ...record,
    ...patch,
    status: stage === PROVISIONING_SAGA_STAGES.ACTIVE
      ? 'ACTIVE'
      : stage === PROVISIONING_SAGA_STAGES.FAILED
        ? 'FAILED'
        : 'IN_PROGRESS',
    stage,
    lastConfirmedStage: stage === PROVISIONING_SAGA_STAGES.FAILED
      ? record.lastConfirmedStage
      : stage,
    updatedAt: new Date().toISOString(),
  };
  const result = await redisCommand([
    'SET',
    key,
    JSON.stringify(updated),
    'XX',
    'KEEPTTL',
  ]);
  if (result !== 'OK') {
    throw new Error('Provisioning saga record could not be updated');
  }
  return updated;
}

export async function updateProvisioningAudit(jti, patch) {
  if (!hasRedisConfig()) {
    throw new Error('Redis is required for provisioning audit updates');
  }
  const key = provisioningKey(jti);
  const existing = await redisCommand(['GET', key]);
  if (typeof existing !== 'string' || !existing) {
    throw new Error('Provisioning audit record was not found');
  }
  const record = JSON.parse(existing);
  const updated = {
    ...record,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  const result = await redisCommand([
    'SET',
    key,
    JSON.stringify(updated),
    'XX',
    'KEEPTTL',
  ]);
  if (result !== 'OK') {
    throw new Error('Provisioning audit record could not be updated');
  }
}
