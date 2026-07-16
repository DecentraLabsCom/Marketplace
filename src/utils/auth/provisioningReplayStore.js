import { hasRedisConfig, redisCommand } from '@/utils/redis/restClient';

const DEFAULT_AUDIT_RETENTION_SECONDS = 365 * 24 * 60 * 60;

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

export async function consumeProvisioningJti(claims) {
  if (!hasRedisConfig()) {
    throw new Error('Redis is required for provisioning token consumption');
  }

  const key = `provisioning:jti:${claims.jti}`;
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

export async function updateProvisioningAudit(jti, patch) {
  if (!hasRedisConfig()) {
    throw new Error('Redis is required for provisioning audit updates');
  }
  const key = `provisioning:jti:${jti}`;
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
