import { NextResponse } from 'next/server'
import { HttpError, requireAuth } from '@/utils/auth/guards'
import { requirePlatformAdminSession } from '@/utils/auth/platformAdmin'
import { listProvisioningAudits } from '@/utils/auth/provisioningReplayStore'
import { isInstitutionalBackendSuspended } from '@/utils/onboarding/institutionalBackend'
import { createRateLimiter, createRateLimitResponse } from '@/utils/api/rateLimit'
import { publicErrorResponse } from '@/utils/security/publicError'

export const runtime = 'nodejs'

const checkRate = createRateLimiter({
  operation: 'admin-provisioning-status',
  windowMs: 60_000,
  maxRequests: 30,
})

const WALLET_VERIFIED_STAGES = new Set([
  'WALLET_VERIFIED',
  'PROVIDER_ADDED',
  'INSTITUTION_ROLE_GRANTED',
  'BACKEND_REGISTERED',
  'ACTIVE',
  'FAILED',
])

const PROVIDER_ENABLED_STAGES = new Set([
  'PROVIDER_ADDED',
  'INSTITUTION_ROLE_GRANTED',
  'BACKEND_REGISTERED',
  'ACTIVE',
])

const BACKEND_REGISTERED_STAGES = new Set(['BACKEND_REGISTERED', 'ACTIVE'])

const RECONCILIATION_STAGES = new Set(['FAILED', 'RECONCILIATION_REQUIRED'])

function toSafeTransactionHashes(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter((hash) => typeof hash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(hash))
    .slice(-10)
}

async function toStatusRecord(record) {
  const stage = typeof record?.stage === 'string' ? record.stage : 'UNKNOWN'
  const status = typeof record?.status === 'string' ? record.status : 'UNKNOWN'
  const expiresAt = Number(record?.expiresAt)
  const isExpired = Number.isSafeInteger(expiresAt) && expiresAt <= Math.floor(Date.now() / 1000)
  const institutionId = typeof record?.institutionId === 'string' ? record.institutionId : null

  const txHashes = toSafeTransactionHashes(record?.txHashes)
  const hasOnChainEvidence = txHashes.length > 0
    || (typeof record?.lastConfirmedStage === 'string' && record.lastConfirmedStage !== 'TOKEN_ISSUED')
  const requiresReconciliation = RECONCILIATION_STAGES.has(stage)
    && (stage === 'RECONCILIATION_REQUIRED' || hasOnChainEvidence)
  const displayStatus = requiresReconciliation ? 'RECONCILIATION_REQUIRED' : status
  const displayStage = requiresReconciliation ? 'RECONCILIATION_REQUIRED' : stage
  const confirmedStage = typeof record?.lastConfirmedStage === 'string'
    ? record.lastConfirmedStage
    : (RECONCILIATION_STAGES.has(stage) ? null : stage)

  return {
    id: typeof record?.jti === 'string' ? record.jti : null,
    institutionId,
    walletAddress: typeof record?.walletAddress === 'string' ? record.walletAddress : null,
    canonicalBackendOrigin: typeof record?.canonicalBackendOrigin === 'string'
      ? record.canonicalBackendOrigin
      : null,
    registrationType: record?.registrationType === 'consumer' ? 'consumer' : 'provider',
    providerName: typeof record?.providerName === 'string' ? record.providerName : null,
    issuedAt: Number.isSafeInteger(Number(record?.issuedAt)) ? Number(record.issuedAt) : null,
    expiresAt: Number.isSafeInteger(expiresAt) ? expiresAt : null,
    consumedAt: typeof record?.consumedAt === 'string' ? record.consumedAt : null,
    startedAt: typeof record?.startedAt === 'string' ? record.startedAt : null,
    updatedAt: typeof record?.updatedAt === 'string' ? record.updatedAt : null,
    status: displayStatus,
    stage: displayStage,
    rawStatus: status,
    rawStage: stage,
    lastConfirmedStage: typeof record?.lastConfirmedStage === 'string' ? record.lastConfirmedStage : null,
    errorCode: typeof record?.errorCode === 'string' ? record.errorCode : null,
    txHashes,
    tokenConsumed: Boolean(record?.consumedAt) || stage !== 'TOKEN_ISSUED',
    tokenExpired: !record?.consumedAt && isExpired,
    walletVerified: WALLET_VERIFIED_STAGES.has(confirmedStage),
    providerEnabled: record?.registrationType === 'provider' && PROVIDER_ENABLED_STAGES.has(confirmedStage),
    backendRegistered: BACKEND_REGISTERED_STAGES.has(confirmedStage),
    canRetry: displayStatus === 'FAILED' && !isExpired,
    requiresReconciliation,
    definitiveFailure: displayStatus === 'FAILED' && !requiresReconciliation,
    suspended: institutionId ? await isInstitutionalBackendSuspended(institutionId) : false,
  }
}

export async function GET(request) {
  try {
    const session = await requireAuth()
    const adminEmail = requirePlatformAdminSession(session)
    const rate = await checkRate(request, { email: adminEmail, institutionId: 'platform-admin' })
    const rateResponse = createRateLimitResponse(rate)
    if (rateResponse) return rateResponse

    const records = await listProvisioningAudits()
    return NextResponse.json({
      records: await Promise.all(records.map(toStatusRecord)),
    })
  } catch (error) {
    return publicErrorResponse({
      status: error instanceof HttpError ? error.status : 503,
      code: error instanceof HttpError ? error.code || 'FORBIDDEN' : 'PROVISIONING_STATUS_UNAVAILABLE',
      message: error instanceof HttpError
        ? error.message
        : 'Provisioning status is temporarily unavailable.',
      error,
      context: 'admin-provisioning-status',
    })
  }
}
