/**
 * Tests for POST /api/auth/lab-access
 */
import { POST } from '../route'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'
import marketplaceJwtService from '@/utils/auth/marketplaceJwt'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { getPucFromSession } from '@/utils/webauthn/service'

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data, init) => ({
      status: init?.status ?? 200,
      body: data,
      json: async () => data,
    })),
  },
}))

jest.mock('@/utils/auth/guards', () => ({
  BadRequestError: class BadRequestError extends Error {
    constructor(msg) { super(msg); this.name = 'BadRequestError' }
  },
  handleGuardError: jest.fn((err) => ({
    status: 400,
    body: { error: err.message },
  })),
  requireAuth: jest.fn(),
}))

jest.mock('@/utils/auth/marketplaceJwt', () => ({
  __esModule: true,
  default: {
    isConfigured: jest.fn(),
    generateSamlAuthToken: jest.fn(),
  },
}))

jest.mock('@/app/api/contract/utils/contractInstance', () => ({
  getContractInstance: jest.fn(),
}))

jest.mock('@/utils/webauthn/service', () => ({
  getPucFromSession: jest.fn(),
}))

jest.mock('@/utils/dev/logger', () => ({
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}))

global.fetch = jest.fn()

// ── Constants ──────────────────────────────────────────────────────────────

const VALID_SESSION = {
  id: 'user-1',
  affiliation: 'university.edu',
  samlAssertion: '<xml>assertion</xml>',
}
const AUTH_BASE = 'https://lab.example.com/auth'

function makeRequest(body = {}) {
  return { json: async () => body }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('POST /api/auth/lab-access', () => {
  let mockContract

  beforeEach(() => {
    jest.clearAllMocks()

    mockContract = {
      getLabAuthURI: jest.fn().mockResolvedValue(AUTH_BASE + '/'),
      resolveSchacHomeOrganization: jest.fn().mockResolvedValue('0xProviderWallet'),
    }
    getContractInstance.mockResolvedValue(mockContract)
    requireAuth.mockResolvedValue(VALID_SESSION)
    marketplaceJwtService.isConfigured.mockResolvedValue(true)
    marketplaceJwtService.generateSamlAuthToken.mockResolvedValue('mock-jwt')
    getPucFromSession.mockReturnValue(null)

    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ accessGranted: true }),
    })
  })

  it('returns 400 when labId and reservationKey are both missing', async () => {
    const req = makeRequest({})
    const res = await POST(req)
    expect(handleGuardError).toHaveBeenCalled()
    expect(res.body.error).toMatch(/missing labid or reservationkey/i)
  })

  it('returns 400 when session has no samlAssertion', async () => {
    requireAuth.mockResolvedValue({ id: 'u', affiliation: 'uni.edu' })
    const req = makeRequest({ labId: '5' })
    const res = await POST(req)
    expect(res.body.error).toMatch(/missing sso session/i)
  })

  it('returns 400 when auth endpoint cannot be resolved', async () => {
    mockContract.getLabAuthURI.mockResolvedValue('')
    const req = makeRequest({ labId: '5' })
    const res = await POST(req)
    expect(res.body.error).toMatch(/invalid auth endpoint/i)
  })

  it('returns 400 when JWT service is not configured', async () => {
    marketplaceJwtService.isConfigured.mockResolvedValue(false)
    const req = makeRequest({ labId: '5', authEndpoint: AUTH_BASE })
    const res = await POST(req)
    expect(res.body.error).toMatch(/not configured/i)
  })

  it('returns 400 when institution wallet is zero address', async () => {
    mockContract.resolveSchacHomeOrganization.mockResolvedValue('0x0000000000000000000000000000000000000000')
    const req = makeRequest({ labId: '5', authEndpoint: AUTH_BASE })
    const res = await POST(req)
    expect(res.body.error).toMatch(/wallet not registered/i)
  })

  it('calls the saml-auth2 endpoint on the downstream lab on success', async () => {
    const req = makeRequest({ labId: '5', authEndpoint: AUTH_BASE })
    const res = await POST(req)
    expect(fetch).toHaveBeenCalledWith(
      `${AUTH_BASE}/saml-auth2`,
      expect.objectContaining({ method: 'POST' }),
    )
    expect(res.status).toBe(200)
    expect(res.body.accessGranted).toBe(true)
  })

  it('returns downstream error status when lab access fails', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    })
    const req = makeRequest({ labId: '5', authEndpoint: AUTH_BASE })
    const res = await POST(req)
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/sso lab access failed/i)
  })

  it('resolves auth endpoint via labId when not in body', async () => {
    const req = makeRequest({ labId: '7' })
    await POST(req)
    expect(mockContract.getLabAuthURI).toHaveBeenCalledWith(7)
  })
})
