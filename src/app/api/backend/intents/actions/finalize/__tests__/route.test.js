/**
 * Tests for POST /api/backend/intents/actions/finalize
 */
import { POST } from '../route'
import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import { isoBase64URL } from '@simplewebauthn/server/helpers'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'
import { getOriginFromRequest, getRpId } from '@/utils/webauthn/config'
import { buildIntentChallenge } from '@/utils/webauthn/challenge'
import { getAssertionChallenge, clearAssertionChallenge, getCredentialById, saveCredential } from '@/utils/webauthn/store'
import { registerIntentOnChain } from '@/utils/intents/adminIntentSigner'
import { serializeIntent } from '@/utils/intents/serialize'
import { getPucFromSession } from '@/utils/webauthn/service'
import { getIntentBackendAuthToken, submitIntentExecutionToBackend } from '@/utils/intents/backendClient'

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data, init) => ({ status: init?.status ?? 200, body: data })),
  },
}))
jest.mock('@simplewebauthn/server', () => ({
  verifyAuthenticationResponse: jest.fn(),
}))
jest.mock('@simplewebauthn/server/helpers', () => ({
  isoBase64URL: { toBuffer: jest.fn(() => Buffer.from('mock')) },
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
jest.mock('@/utils/webauthn/config', () => ({
  getOriginFromRequest: jest.fn(),
  getRpId: jest.fn(),
}))
jest.mock('@/utils/webauthn/challenge', () => ({
  buildIntentChallenge: jest.fn(),
}))
jest.mock('@/utils/webauthn/store', () => ({
  getAssertionChallenge: jest.fn(),
  clearAssertionChallenge: jest.fn(),
  getCredentialById: jest.fn(),
  saveCredential: jest.fn(),
}))
jest.mock('@/utils/intents/adminIntentSigner', () => ({
  registerIntentOnChain: jest.fn(),
}))
jest.mock('@/utils/intents/serialize', () => ({
  serializeIntent: jest.fn((val) => val),
}))
jest.mock('@/utils/webauthn/service', () => ({
  getPucFromSession: jest.fn(),
}))
jest.mock('@/utils/intents/backendClient', () => ({
  getIntentBackendAuthToken: jest.fn(),
  submitIntentExecutionToBackend: jest.fn(),
}))
jest.mock('@/utils/dev/logger', () => ({
  error: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
}))

function makeRequest(body) {
  return { json: async () => body }
}

describe('POST /api/backend/intents/actions/finalize', () => {
  const originalEnv = process.env
  let mockSession

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'error').mockImplementation(() => {})
    process.env = { ...originalEnv, INSTITUTION_BACKEND_URL: 'http://test-backend.com' }

    mockSession = { samlAssertion: 'mock-saml' }
    requireAuth.mockResolvedValue(mockSession)
    getPucFromSession.mockReturnValue('mock-puc')

    getAssertionChallenge.mockReturnValue({
      puc: 'mock-puc',
      credentialId: 'mock-cred-id',
      expectedChallenge: 'mock-expected-challenge',
      meta: { requestId: 'req-123' },
      payload: { actionProps: true },
      payloadHash: 'mock-hash',
    })
    
    getCredentialById.mockReturnValue({
      credentialId: 'mock-cred-id',
      publicKeySpki: 'mock-pub-key',
      signCount: 0,
      rpId: 'test-rpid'
    })

    buildIntentChallenge.mockReturnValue({ challenge: 'mock-expected-challenge' })
    getOriginFromRequest.mockReturnValue('http://localhost:3000')
    getRpId.mockReturnValue('localhost')

    verifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 1 },
    })

    registerIntentOnChain.mockResolvedValue({ txHash: '0xTxHash' })
    
    getIntentBackendAuthToken.mockResolvedValue({ token: 'mock-token' })
    submitIntentExecutionToBackend.mockResolvedValue({
      ok: true,
      status: 200,
      body: { success: true },
    })
  })

  afterEach(() => {
    console.error.mockRestore()
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('returns 400 when intent meta is missing', async () => {
    const res = await POST(makeRequest({ payload: {} }))
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Missing intent meta/)
  })

  it('returns 400 when PUC is missing in session', async () => {
    getPucFromSession.mockReturnValue(null)
    const res = await POST(makeRequest({ meta: { requestId: 'req-123' } }))
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Missing PUC/)
  })

  it('returns 400 when SAML assertion is missing', async () => {
    requireAuth.mockResolvedValue({})
    const res = await POST(makeRequest({ meta: { requestId: 'req-123' } }))
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Missing SAML assertion/)
  })

  it('returns 400 when prepared challenge is not found', async () => {
    getAssertionChallenge.mockReturnValue(null)
    const res = await POST(makeRequest({ meta: { requestId: 'req-notFound' } }))
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/No prepared challenge found/)
  })

  it('returns 403 when challenge PUC mismatches current session PUC', async () => {
    getAssertionChallenge.mockReturnValue({ puc: 'different-puc' })
    const res = await POST(makeRequest({ meta: { requestId: 'req-123' } }))
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/Challenge PUC mismatch/)
  })

  it('returns 400 when credential is not found', async () => {
    getCredentialById.mockReturnValue(null)
    const res = await POST(makeRequest({ meta: { requestId: 'req-123' } }))
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Stored WebAuthn credential not found/)
  })

  it('returns 400 when WebAuthn assertion data is incomplete', async () => {
    const res = await POST(makeRequest({ meta: { requestId: 'req-123' }, webauthnClientDataJSON: 'data' })) // Missing others
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Incomplete WebAuthn assertion/)
  })

  it('returns 401 when verifyAuthenticationResponse yields verified=false', async () => {
    verifyAuthenticationResponse.mockResolvedValue({ verified: false })
    const res = await POST(makeRequest({
      meta: { requestId: 'req-123' },
      webauthnClientDataJSON: 'a',
      webauthnAuthenticatorData: 'b',
      webauthnSignature: 'c'
    }))
    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/WebAuthn assertion failed verification/)
  })

  it('successfully finalizes action intent', async () => {
    const res = await POST(makeRequest({
      meta: { requestId: 'req-123' },
      webauthnClientDataJSON: 'a',
      webauthnAuthenticatorData: 'b',
      webauthnSignature: 'c'
    }))
    expect(res.status).toBe(200)
    expect(res.body.verified).toBe(true)
    expect(res.body.onChain).toEqual({ txHash: '0xTxHash' })
    expect(res.body.backendResponse).toEqual({ status: 200, body: { success: true } })
    expect(registerIntentOnChain).toHaveBeenCalledWith('action', expect.any(Object), expect.any(Object), undefined)
    expect(submitIntentExecutionToBackend).toHaveBeenCalled()
    expect(saveCredential).toHaveBeenCalledWith(expect.objectContaining({ signCount: 1 }))
    expect(clearAssertionChallenge).toHaveBeenCalledWith('req-123')
  })

  it('returns 502 if on-chain registration fails during finalization', async () => {
    registerIntentOnChain.mockRejectedValue(new Error('RPC Error'))
    const res = await POST(makeRequest({
      meta: { requestId: 'req-123' },
      webauthnClientDataJSON: 'a',
      webauthnAuthenticatorData: 'b',
      webauthnSignature: 'c'
    }))
    expect(res.status).toBe(502)
    expect(res.body.error).toMatch(/Failed to register action intent on-chain/)
    expect(clearAssertionChallenge).toHaveBeenCalled()
  })

  it('reports backendError if submitIntentExecutionToBackend fails', async () => {
    submitIntentExecutionToBackend.mockResolvedValue({
      ok: false,
      status: 400,
      body: { error: 'Invalid intent state' }
    })
    const res = await POST(makeRequest({
      meta: { requestId: 'req-123' },
      webauthnClientDataJSON: 'a',
      webauthnAuthenticatorData: 'b',
      webauthnSignature: 'c'
    }))
    expect(res.status).toBe(200) // Still 200 OK for our endpoint, but backend error propagated
    expect(res.body.backendResponse).toEqual({ status: 400, body: { error: 'Invalid intent state' } })
    expect(res.body.backendError).toMatch(/Backend responded with status 400/)
  })

  it('delegates to handleGuardError on UnauthorizedError', async () => {
    const err = new Error('Auth failed'); err.name = 'UnauthorizedError'; err.statusCode = 401
    requireAuth.mockRejectedValue(err)
    const res = await POST(makeRequest({ meta: { requestId: 'req-123' } }))
    expect(handleGuardError).toHaveBeenCalledWith(err)
    expect(res.status).toBe(401)
  })
})
