/**
 * @jest-environment node
 */

import { requireAuth } from '@/utils/auth/guards'
import { requirePlatformAdminSession } from '@/utils/auth/platformAdmin'
import { listProvisioningAudits } from '@/utils/auth/provisioningReplayStore'
import { isInstitutionalBackendSuspended } from '@/utils/onboarding/institutionalBackend'

jest.mock('@/utils/auth/guards', () => {
  class HttpError extends Error {
    constructor(status, message) {
      super(message)
      this.status = status
    }
  }
  return { requireAuth: jest.fn(), HttpError }
})

jest.mock('@/utils/auth/platformAdmin', () => ({
  requirePlatformAdminSession: jest.fn(),
}))

jest.mock('@/utils/auth/provisioningReplayStore', () => ({
  listProvisioningAudits: jest.fn(),
}))

jest.mock('@/utils/onboarding/institutionalBackend', () => ({
  isInstitutionalBackendSuspended: jest.fn(),
}))

jest.mock('@/utils/api/rateLimit', () => ({
  createRateLimiter: () => jest.fn(async () => ({ limited: false })),
  createRateLimitResponse: jest.fn(),
}))

describe('GET /api/admin/institutions/provisioning-status', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    requireAuth.mockResolvedValue({ samlAssertion: 'assertion', email: 'admin@example.edu' })
    listProvisioningAudits.mockResolvedValue([{
      jti: 'provisioning-1',
      institutionId: 'partner.edu',
      walletAddress: '0x1234567890123456789012345678901234567890',
      canonicalBackendOrigin: 'https://gateway.partner.edu',
      registrationType: 'provider',
      stage: 'ACTIVE',
      status: 'ACTIVE',
      issuedAt: 1_700_000_000,
      expiresAt: 1_700_000_300,
      consumedAt: '2025-01-01T10:00:00.000Z',
      txHashes: [`0x${'a'.repeat(64)}`],
      nonce: 'must-not-leak',
    }])
    isInstitutionalBackendSuspended.mockResolvedValue(false)
  })

  test('returns a platform-admin-only, redacted provisioning status list', async () => {
    const { GET } = await import('../api/admin/institutions/provisioning-status/route')

    const response = await GET(new Request('https://marketplace.example/api/admin/institutions/provisioning-status'))

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.records[0]).toMatchObject({
      id: 'provisioning-1',
      institutionId: 'partner.edu',
      tokenConsumed: true,
      suspended: false,
      txHashes: [`0x${'a'.repeat(64)}`],
    })
    expect(requirePlatformAdminSession).toHaveBeenCalled()
  })

  test('does not expose the provisioning nonce in the status response', async () => {
    const { GET } = await import('../api/admin/institutions/provisioning-status/route')
    const response = await GET(new Request('https://marketplace.example/api/admin/institutions/provisioning-status'))

    const body = await response.json()
    expect(body.records[0]).not.toHaveProperty('nonce')
  })

  test('does not present a failed saga with confirmed writes as a definitive failure', async () => {
    listProvisioningAudits.mockResolvedValueOnce([{
      jti: 'provisioning-2',
      institutionId: 'partner.edu',
      walletAddress: '0x1234567890123456789012345678901234567890',
      registrationType: 'provider',
      stage: 'FAILED',
      status: 'FAILED',
      lastConfirmedStage: 'PROVIDER_ADDED',
      txHashes: [`0x${'b'.repeat(64)}`],
    }])

    const { GET } = await import('../api/admin/institutions/provisioning-status/route')
    const response = await GET(new Request('https://marketplace.example/api/admin/institutions/provisioning-status'))
    const body = await response.json()

    expect(body.records[0]).toMatchObject({
      status: 'RECONCILIATION_REQUIRED',
      stage: 'RECONCILIATION_REQUIRED',
      requiresReconciliation: true,
      definitiveFailure: false,
    })
  })

  test('hides expired tokens superseded by a completed registration for the same institution and role', async () => {
    const expiredToken = {
      jti: 'provisioning-expired',
      institutionId: 'partner.edu',
      walletAddress: '0x1234567890123456789012345678901234567890',
      canonicalBackendOrigin: 'https://gateway.partner.edu',
      registrationType: 'provider',
      stage: 'TOKEN_ISSUED',
      status: 'PENDING',
      issuedAt: 1_699_999_000,
      expiresAt: 1_700_000_000,
      consumedAt: null,
    }
    const activeToken = {
      jti: 'provisioning-active',
      institutionId: 'partner.edu',
      walletAddress: '0x1234567890123456789012345678901234567890',
      canonicalBackendOrigin: 'https://gateway.partner.edu',
      registrationType: 'provider',
      stage: 'ACTIVE',
      status: 'ACTIVE',
      issuedAt: 1_700_000_100,
      expiresAt: 1_700_000_400,
      consumedAt: '2025-01-01T10:00:00.000Z',
    }
    listProvisioningAudits.mockResolvedValueOnce([expiredToken, activeToken])

    const { GET } = await import('../api/admin/institutions/provisioning-status/route')
    const response = await GET(new Request('https://marketplace.example/api/admin/institutions/provisioning-status'))
    const body = await response.json()

    expect(body.records).toHaveLength(1)
    expect(body.records[0]).toMatchObject({
      id: 'provisioning-active',
      status: 'ACTIVE',
    })
  })

  test('keeps expired tokens visible until the institution has a completed registration', async () => {
    listProvisioningAudits.mockResolvedValueOnce([{
      jti: 'provisioning-expired-only',
      institutionId: 'pending.partner.edu',
      walletAddress: '0x1234567890123456789012345678901234567890',
      canonicalBackendOrigin: 'https://gateway.pending.partner.edu',
      registrationType: 'provider',
      stage: 'TOKEN_ISSUED',
      status: 'PENDING',
      issuedAt: 1_699_999_000,
      expiresAt: 1_700_000_000,
      consumedAt: null,
    }])

    const { GET } = await import('../api/admin/institutions/provisioning-status/route')
    const response = await GET(new Request('https://marketplace.example/api/admin/institutions/provisioning-status'))
    const body = await response.json()

    expect(body.records).toHaveLength(1)
    expect(body.records[0]).toMatchObject({
      id: 'provisioning-expired-only',
      tokenExpired: true,
    })
  })
})
