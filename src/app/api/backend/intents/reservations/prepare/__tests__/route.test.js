/**
 * Tests for POST /api/backend/intents/reservations/prepare
 */
import { POST } from '../route'
import { ethers } from 'ethers'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'
import { buildReservationIntent, computeReservationAssertionHash } from '@/utils/intents/signInstitutionalReservationIntent'
import { resolveIntentExecutorForInstitution } from '@/utils/intents/resolveIntentExecutor'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { getPucFromSession } from '@/utils/webauthn/service'
import { serializeIntent } from '@/utils/intents/serialize'
import { signIntentMeta, getAdminAddress, registerIntentOnChain } from '@/utils/intents/adminIntentSigner'
import {
  getIntentBackendAuthToken,
  requestIntentAuthorizationSession,
  mapAuthorizationErrorCode,
  normalizeAuthorizationResponse,
  hasUsableAuthorizationSession,
  resolveAuthorizationUrl,
} from '@/utils/intents/backendClient'
import { extractOnchainErrorDetails, resolveChainNowSec } from '@/utils/intents/onchainHelpers'
import { resolveInstitutionDomainFromSession } from '@/utils/auth/institutionDomain'
import { resolveInstitutionAddressFromSession } from '@/app/api/contract/utils/institutionSession'

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data, init) => ({ status: init?.status ?? 200, body: data })),
  },
}))
jest.mock('ethers', () => ({
  ethers: {
    solidityPackedKeccak256: jest.fn(() => '0xMockReservationKey'),
    ZeroAddress: '0x0000000000000000000000000000000000000000',
    ZeroHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
  },
}))
jest.mock('@/utils/auth/guards', () => {
  class HttpError extends Error { constructor(msg, code) { super(msg); this.name = 'HttpError'; this.statusCode = code } }
  class UnauthorizedError extends HttpError { constructor(msg) { super(msg, 401); this.name = 'UnauthorizedError' } }
  return {
    UnauthorizedError,
    requireAuth: jest.fn(),
    handleGuardError: jest.fn((err) => ({ status: err.statusCode || 401, body: { error: err.message } })),
  }
})
jest.mock('@/utils/intents/signInstitutionalReservationIntent', () => ({
  buildReservationIntent: jest.fn(),
  computeReservationAssertionHash: jest.fn(),
  ACTION_CODES: {
    REQUEST_BOOKING: 8,
    DIRECT_BOOKING: 11,
  },
}))
jest.mock('@/utils/intents/resolveIntentExecutor', () => ({
  resolveIntentExecutorForInstitution: jest.fn(),
}))
jest.mock('@/app/api/contract/utils/contractInstance', () => ({
  getContractInstance: jest.fn(),
}))
jest.mock('@/utils/webauthn/service', () => ({
  getPucFromSession: jest.fn(),
}))
jest.mock('@/utils/intents/serialize', () => ({
  serializeIntent: jest.fn((val) => val), // passthrough
}))
jest.mock('@/utils/intents/adminIntentSigner', () => ({
  signIntentMeta: jest.fn(),
  getAdminAddress: jest.fn(),
  registerIntentOnChain: jest.fn(),
}))
jest.mock('@/utils/intents/backendClient', () => ({
  getIntentBackendAuthToken: jest.fn(),
  requestIntentAuthorizationSession: jest.fn(),
  mapAuthorizationErrorCode: jest.fn(),
  normalizeAuthorizationResponse: jest.fn((val) => val),
  hasUsableAuthorizationSession: jest.fn(),
  resolveAuthorizationUrl: jest.fn(),
}))
jest.mock('@/utils/intents/onchainHelpers', () => ({
  extractOnchainErrorDetails: jest.fn(),
  resolveChainNowSec: jest.fn(),
}))
jest.mock('@/utils/auth/institutionDomain', () => ({
  resolveInstitutionDomainFromSession: jest.fn(),
}))
jest.mock('@/app/api/contract/utils/institutionSession', () => ({
  resolveInstitutionAddressFromSession: jest.fn(),
}))
jest.mock('@/utils/dev/logger', () => ({
  error: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
}))

function makeRequest(body) {
  return { json: async () => body }
}

describe('POST /api/backend/intents/reservations/prepare', () => {
  const originalEnv = process.env
  let mockSession
  let validStart

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...originalEnv, INSTITUTION_BACKEND_URL: 'http://test-backend.com' }
    validStart = Math.floor(Date.now() / 1000) + 3600 // 1 hr in future

    mockSession = { samlAssertion: 'mock-saml' }
    requireAuth.mockResolvedValue(mockSession)
    getPucFromSession.mockReturnValue('mock-puc')
    resolveInstitutionDomainFromSession.mockReturnValue('test-institution.com')
    
    getContractInstance.mockResolvedValue({
      getLab: jest.fn().mockResolvedValue({ base: { price: BigInt(100) } }),
      ownerOf: jest.fn().mockResolvedValue('0xLabOwner'),
    })
    resolveInstitutionAddressFromSession.mockResolvedValue({ institutionAddress: '0xLabOwner' })
    resolveIntentExecutorForInstitution.mockResolvedValue('0xExecutor')
    getAdminAddress.mockResolvedValue('0xAdmin')
    computeReservationAssertionHash.mockReturnValue('0xAssertionHash')
    resolveChainNowSec.mockResolvedValue(1000000000)
    
    buildReservationIntent.mockResolvedValue({
      meta: { requestId: 'req-123', requestedAt: 123, expiresAt: 456 },
      payload: { dummy: true },
      typedData: {},
    })
    signIntentMeta.mockResolvedValue('0xAdminSignature')
    registerIntentOnChain.mockResolvedValue({ txHash: '0xTxHash' })
    
    getIntentBackendAuthToken.mockResolvedValue({ token: 'mock-token', expiresAt: 999 })
    requestIntentAuthorizationSession.mockResolvedValue({
      ok: true,
      data: { sessionId: 'sess-123', expiresAt: 999 },
    })
    hasUsableAuthorizationSession.mockReturnValue(true)
    resolveAuthorizationUrl.mockReturnValue('http://test-backend.com/auth')
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('returns 400 when labId is missing', async () => {
    const res = await POST(makeRequest({ start: validStart, timeslot: 3600 }))
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Missing labId/)
  })

  it('returns 400 when start is missing', async () => {
    const res = await POST(makeRequest({ labId: 1, timeslot: 3600 }))
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Missing start/)
  })

  it('returns 400 when timeslot is invalid', async () => {
    const res = await POST(makeRequest({ labId: 1, start: validStart, timeslot: 0 }))
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Invalid timeslot/)
  })

  it('returns 400 when start is in the past', async () => {
    const res = await POST(makeRequest({ labId: 1, start: 10000, timeslot: 3600 }))
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Cannot book in the past/)
  })

  it('returns 400 when SAML assertion is missing', async () => {
    requireAuth.mockResolvedValue({}) // No SAML
    const res = await POST(makeRequest({ labId: 1, start: validStart, timeslot: 3600 }))
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Missing SAML assertion/)
  })

  it('returns 400 when PUC is missing', async () => {
    getPucFromSession.mockReturnValue(null)
    const res = await POST(makeRequest({ labId: 1, start: validStart, timeslot: 3600 }))
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Missing PUC/)
  })

  it('returns 400 when backendUrl is missing entirely', async () => {
    delete process.env.INSTITUTION_BACKEND_URL
    const res = await POST(makeRequest({ labId: 1, start: validStart, timeslot: 3600 }))
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Missing institutional backend URL/)
  })

  it('successfully prepares a reservation intent', async () => {
    const res = await POST(makeRequest({ labId: 1, start: validStart, timeslot: 3600 }))
    expect(res.status).toBe(200)
    expect(res.body.kind).toBe('reservation')
    expect(res.body.adminSignature).toBe('0xAdminSignature')
    expect(res.body.authorizationUrl).toBe('http://test-backend.com/auth')
    expect(registerIntentOnChain).toHaveBeenCalled()
    expect(requestIntentAuthorizationSession).toHaveBeenCalled()
  })

  it('returns 502 if on-chain registration fails', async () => {
    registerIntentOnChain.mockRejectedValue(new Error('RPC Error'))
    extractOnchainErrorDetails.mockReturnValue({ contractError: 'CustomError' })
    const res = await POST(makeRequest({ labId: 1, start: validStart, timeslot: 3600 }))
    expect(res.status).toBe(502)
    expect(res.body.error).toMatch(/Failed to register reservation intent on-chain/)
    expect(res.body.onchain).toEqual({ contractError: 'CustomError' })
  })

  it('forwards authorization error if session request is not ok', async () => {
    requestIntentAuthorizationSession.mockResolvedValue({
      ok: false,
      status: 403,
      data: { error: 'Insufficient funds' }
    })
    mapAuthorizationErrorCode.mockReturnValue('INSUFFICIENT_FUNDS')
    const res = await POST(makeRequest({ labId: 1, start: validStart, timeslot: 3600 }))
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('INSUFFICIENT_FUNDS')
    expect(res.body.error).toBe('Insufficient funds')
  })

  it('returns 502 if authorization response is explicitly unusable', async () => {
    hasUsableAuthorizationSession.mockReturnValue(false)
    const res = await POST(makeRequest({ labId: 1, start: validStart, timeslot: 3600 }))
    expect(res.status).toBe(502)
    expect(res.body.code).toBe('INTENT_AUTHORIZATION_RESPONSE_INVALID')
  })

  it('delegates to handleGuardError on UnauthorizedError', async () => {
    const err = new Error('Auth failed'); err.name = 'UnauthorizedError'; err.statusCode = 401
    requireAuth.mockRejectedValue(err)
    const res = await POST(makeRequest({ labId: 1, start: validStart, timeslot: 3600 }))
    expect(handleGuardError).toHaveBeenCalledWith(err)
    expect(res.status).toBe(401)
  })

  it('returns 500 on unexpected exceptions during preparation', async () => {
    resolveIntentExecutorForInstitution.mockRejectedValue(new Error('Unexpected exception'))
    const res = await POST(makeRequest({ labId: 1, start: validStart, timeslot: 3600 }))
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('INTENT_PREPARE_FAILED')
  })
})
