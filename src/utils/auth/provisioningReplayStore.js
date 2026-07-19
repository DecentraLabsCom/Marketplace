import { hasRedisConfig, redisCommand } from '../redis/restClient.js';

const DEFAULT_AUDIT_RETENTION_SECONDS = 365 * 24 * 60 * 60;

export const PROVISIONING_SAGA_STAGES = Object.freeze({
  TOKEN_ISSUED: 'TOKEN_ISSUED',
  WALLET_VERIFIED: 'WALLET_VERIFIED',
  PROVIDER_ADDED: 'PROVIDER_ADDED',
  INSTITUTION_ROLE_GRANTED: 'INSTITUTION_ROLE_GRANTED',
  BACKEND_REGISTERED: 'BACKEND_REGISTERED',
  ACTIVE: 'ACTIVE',
  FAILED: 'FAILED',
  RECONCILIATION_REQUIRED: 'RECONCILIATION_REQUIRED',
});

const PROVISIONING_AUDIT_INDEX_KEY = 'provisioning:index';
const MAX_PROVISIONING_AUDIT_RESULTS = 100;

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
    providerName: claims.providerName || claims.consumerName || null,
    providerEmail: claims.providerEmail || null,
    providerCountry: claims.providerCountry || null,
    agreementId: claims.agreementId || null,
    consumedAt: new Date().toISOString(),
  };
}

function provisioningKey(jti) {
  return `provisioning:jti:${jti}`;
}

function parseAuditRecord(value, errorMessage) {
  if (typeof value !== 'string' || !value) {
    throw new Error(errorMessage);
  }
  try {
    return JSON.parse(value);
  } catch {
    throw new Error('Provisioning saga record is malformed');
  }
}

function toIssuedAtScore(value) {
  const score = Number(value);
  return Number.isSafeInteger(score) && score > 0 ? score : Math.floor(Date.now() / 1000);
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

function buildIssuedRecord(claims) {
  return {
    ...buildAuditRecord(claims),
    status: 'PENDING',
    stage: PROVISIONING_SAGA_STAGES.TOKEN_ISSUED,
    lastConfirmedStage: null,
    tokenIssuedAt: new Date(toIssuedAtScore(claims.issuedAt) * 1000).toISOString(),
    consumedAt: null,
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
 * Persists a token issuance before it leaves the platform-admin boundary.
 * This lets the admin distinguish an unconsumed token from a registration
 * that has reached the institutional wallet verification stage.
 */
export async function recordProvisioningTokenIssued(claims) {
  if (!hasRedisConfig()) {
    throw new Error('Redis is required for provisioning audit coordination');
  }

  const key = provisioningKey(claims.jti);
  const record = buildIssuedRecord(claims);
  const created = await redisCommand([
    'SET',
    key,
    JSON.stringify(record),
    'NX',
    'EX',
    String(getRetentionSeconds(claims)),
  ]);

  if (created !== 'OK') {
    throw new ProvisioningReplayError('Provisioning token conflicts with an existing audit record');
  }

  try {
    await redisCommand([
      'ZADD',
      PROVISIONING_AUDIT_INDEX_KEY,
      String(toIssuedAtScore(claims.issuedAt)),
      claims.jti,
    ]);
  } catch (error) {
    // Do not hand out a valid but unobservable administrator-issued token.
    await redisCommand(['DEL', key]).catch(() => {});
    throw error;
  }

  return record;
}

/** Returns recent provisioning audit records. Callers must authorize access. */
export async function listProvisioningAudits({ limit = 50 } = {}) {
  if (!hasRedisConfig()) {
    throw new Error('Redis is required for provisioning audit access');
  }

  const normalizedLimit = Math.max(1, Math.min(MAX_PROVISIONING_AUDIT_RESULTS, Number(limit) || 50));
  const oldestAllowed = Math.floor(Date.now() / 1000) - DEFAULT_AUDIT_RETENTION_SECONDS;
  await redisCommand([
    'ZREMRANGEBYSCORE',
    PROVISIONING_AUDIT_INDEX_KEY,
    '-inf',
    String(oldestAllowed),
  ]);

  const jtis = await redisCommand([
    'ZREVRANGE',
    PROVISIONING_AUDIT_INDEX_KEY,
    '0',
    String(normalizedLimit - 1),
  ]);
  if (!Array.isArray(jtis) || jtis.length === 0) return [];

  const records = [];
  for (const jti of jtis) {
    const value = await redisCommand(['GET', provisioningKey(jti)]);
    if (typeof value !== 'string' || !value) {
      await redisCommand(['ZREM', PROVISIONING_AUDIT_INDEX_KEY, jti]);
      continue;
    }

    try {
      records.push(JSON.parse(value));
    } catch {
      await redisCommand(['ZREM', PROVISIONING_AUDIT_INDEX_KEY, jti]);
    }
  }
  return records;
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

  const record = parseAuditRecord(
    await redisCommand(['GET', key]),
    'Provisioning saga record was not found after a contention response'
  );
  if (!hasMatchingImmutableClaims(record, claims)) {
    throw new ProvisioningReplayError('Provisioning token conflicts with an existing saga');
  }

  if (record.stage === PROVISIONING_SAGA_STAGES.TOKEN_ISSUED) {
    const activated = {
      ...record,
      status: 'IN_PROGRESS',
      stage: PROVISIONING_SAGA_STAGES.WALLET_VERIFIED,
      lastConfirmedStage: PROVISIONING_SAGA_STAGES.WALLET_VERIFIED,
      consumedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const updated = await redisCommand([
      'SET',
      key,
      JSON.stringify(activated),
      'XX',
      'KEEPTTL',
    ]);
    if (updated !== 'OK') {
      throw new Error('Provisioning saga record could not be activated');
    }
    return { record: activated, resumed: false };
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
  const record = parseAuditRecord(
    await redisCommand(['GET', key]),
    'Provisioning saga record was not found'
  );
  const stage = patch.stage || record.stage;
  const updated = {
    ...record,
    ...patch,
    status: stage === PROVISIONING_SAGA_STAGES.ACTIVE
      ? 'ACTIVE'
      : stage === PROVISIONING_SAGA_STAGES.FAILED
        ? 'FAILED'
        : stage === PROVISIONING_SAGA_STAGES.RECONCILIATION_REQUIRED
          ? 'RECONCILIATION_REQUIRED'
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

/**
 * Stops provisioning when an on-chain transition cannot be durably reflected
 * in Redis. The reconciliation job can later repair this marker from chain
 * state without replaying an already-confirmed write.
 */
export async function markProvisioningReconciliationRequired(jti, patch = {}) {
  if (!hasRedisConfig()) {
    throw new Error('Redis is required for provisioning reconciliation markers');
  }

  const key = provisioningKey(jti);
  const record = parseAuditRecord(
    await redisCommand(['GET', key]),
    'Provisioning saga record was not found while marking reconciliation',
  );
  const updated = {
    ...record,
    ...patch,
    status: 'RECONCILIATION_REQUIRED',
    stage: PROVISIONING_SAGA_STAGES.RECONCILIATION_REQUIRED,
    lastConfirmedStage: record.lastConfirmedStage
      || (record.stage !== PROVISIONING_SAGA_STAGES.FAILED
        && record.stage !== PROVISIONING_SAGA_STAGES.RECONCILIATION_REQUIRED
        ? record.stage
        : null),
    reconciliationRequiredAt: new Date().toISOString(),
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
    throw new Error('Provisioning reconciliation marker could not be persisted');
  }
  return updated;
}

export async function updateProvisioningAudit(jti, patch) {
  if (!hasRedisConfig()) {
    throw new Error('Redis is required for provisioning audit updates');
  }
  const key = provisioningKey(jti);
  const record = parseAuditRecord(
    await redisCommand(['GET', key]),
    'Provisioning audit record was not found'
  );
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
  return updated;
}
