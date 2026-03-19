/**
 * Tests for POST /api/backend/intents/actions/prepare
 */
import { POST } from '../route'
import { ethers } from 'ethers'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'
import { ACTION_CODES, buildActionIntent, computeAssertionHash } from '@/utils/intents/signInstitutionalActionIntent'
import { resolveIntentExecutorForInstitution } from '@/utils/intents/resolveIntentExecutor'
import { getPucFromSession } from '@/utils/webauthn/service'
import { signIntentMeta, getAdminAddress, registerIntentOnChain } from '@/utils/intents/adminIntentSigner'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { serializeIntent } from '@/utils/intents/serialize'
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

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data, init) => ({ status: init?.status ?? 200, body: data })),
  },
}))
jest.mock('ethers', () => ({
  ethers: {
    isHexString: jest.fn((v) => typeof v === 'string' && v.startsWith('0x')),
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
jest.mock('@/utils/intents/signInstitutionalActionIntent', () => ({
  ACTION_CODES: {
    CANCEL_BOOKING: 1,
    CANCEL_REQUEST_BOOKING: 2,
    REQUEST_FUNDS: 3,
    SOME_OTHER_ACTION: 4,
  },
  buildActionIntent: jest.fn(),
  computeAssertionHash: jest.fn(),
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
  serializeIntent: jest.fn((val) => val),
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
jest.mock('@/utils/dev/logger', () => ({
  error: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
}))

function makeRequest(body) {
  return { json: async () => body }
}

describe('POST /api/backend/intents/actions/prepare', () => {
  const originalEnv = process.env
  let mockSession

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'error').mockImplementation(() => {})
    process.env = { ...originalEnv, INSTITUTION_BACKEND_URL: 'http://test-backend.com' }

    mockSession = { samlAssertion: 'mock-saml' }
    requireAuth.mockResolvedValue(mockSession)
    getPucFromSession.mockReturnValue('mock-puc')
    resolveInstitutionDomainFromSession.mockReturnValue('test-institution.com')
    
    getContractInstance.mockResolvedValue({
      getReservation: jest.fn().mockResolvedValue({
        labId: BigInt(42),
        price: BigInt(100),
        renter: '0xRenterAddress',
      }),
    })
    resolveIntentExecutorForInstitution.mockResolvedValue('0xExecutor')
    getAdminAddress.mockResolvedValue('0xAdmin')
    computeAssertionHash.mockReturnValue('0xAssertionHash')
    resolveChainNowSec.mockResolvedValue(1000000000)
    
    buildActionIntent.mockResolvedValue({
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

  afterEach(() => {
    console.error.mockRestore()
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('returns 400 when SAML assertion is missing', async () => {
    requireAuth.mockResolvedValue({})
    const res = await POST(makeRequest({ action: 'SOME_OTHER_ACTION' }))
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Missing SAML assertion/)
  })

  it('returns 400 when action is missing or invalid', async () => {
    const res = await POST(makeRequest({ action: null }))
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Invalid action code/)
  })

  it('returns 400 when backendUrl is missing', async () => {
    delete process.env.INSTITUTION_BACKEND_URL
    const res = await POST(makeRequest({ action: 'SOME_OTHER_ACTION' }))
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Missing institutional backend URL/)
  })

  it('validates reservationKey for cancellation actions', async () => {
    const res = await POST(makeRequest({ action: 'CANCEL_BOOKING', payload: { reservationKey: 'invalid' } }))
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Missing or invalid reservationKey/)
  })

  it('returns 404 if reservation does not exist for cancellation intent', async () => {
    getContractInstance.mockResolvedValue({
      getReservation: jest.fn().mockResolvedValue({ renter: ethers.ZeroAddress }),
    })
    const res = await POST(makeRequest({ action: 'CANCEL_BOOKING', payload: { reservationKey: '0x123' } }))
    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/Reservation not found/)
  })

  it('resolves reservation snapshot for cancellation actions', async () => {
    const res = await POST(makeRequest({ action: 'CANCEL_BOOKING', payload: { reservationKey: '0x123' } }))
    expect(res.status).toBe(200)
    expect(res.body.kind).toBe('action')
    expect(res.body.adminSignature).toBe('0xAdminSignature')
    expect(buildActionIntent).toHaveBeenCalledWith(expect.objectContaining({
      labId: '42',
      price: '100',
    }))
  })

  it('validates labId and maxBatch for REQUEST_FUNDS', async () => {
    let res = await POST(makeRequest({ action: 'REQUEST_FUNDS', payload: { labId: -1, maxBatch: 10 } }))
    expect(res.status).toBe(400)
    res = await POST(makeRequest({ action: 'REQUEST_FUNDS', payload: { labId: 1, maxBatch: 101 } }))
    expect(res.status).toBe(400)
  })

  it('successfully prepares a normal action intent', async () => {
    const res = await POST(makeRequest({ action: 'REQUEST_FUNDS', payload: { labId: 1, maxBatch: 10 } }))
    expect(res.status).toBe(200)
    expect(res.body.authorizationUrl).toBe('http://test-backend.com/auth')
    expect(registerIntentOnChain).toHaveBeenCalled()
    expect(requestIntentAuthorizationSession).toHaveBeenCalled()
  })

  it('returns 502 if on-chain registration fails', async () => {
    registerIntentOnChain.mockRejectedValue(new Error('RPC Error'))
    const res = await POST(makeRequest({ action: 'SOME_OTHER_ACTION' }))
    expect(res.status).toBe(502)
    expect(res.body.error).toMatch(/Failed to register action intent on-chain/)
  })

  it('forwards authorization error if session request is not ok', async () => {
    requestIntentAuthorizationSession.mockResolvedValue({
      ok: false,
      status: 403,
      data: { error: 'Not allowed' }
    })
    mapAuthorizationErrorCode.mockReturnValue('NOT_ALLOWED')
    const res = await POST(makeRequest({ action: 'SOME_OTHER_ACTION' }))
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('NOT_ALLOWED')
  })

  it('returns 502 if authorization response is explicitly unusable', async () => {
    hasUsableAuthorizationSession.mockReturnValue(false)
    const res = await POST(makeRequest({ action: 'SOME_OTHER_ACTION' }))
    expect(res.status).toBe(502)
    expect(res.body.code).toBe('INTENT_AUTHORIZATION_RESPONSE_INVALID')
  })

  it('delegates to handleGuardError on UnauthorizedError', async () => {
    const err = new Error('Auth failed'); err.name = 'UnauthorizedError'; err.statusCode = 401
    requireAuth.mockRejectedValue(err)
    const res = await POST(makeRequest({ action: 'SOME_OTHER_ACTION' }))
    expect(handleGuardError).toHaveBeenCalledWith(err)
    expect(res.status).toBe(401)
  })
})
