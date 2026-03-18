/**
 * Tests for POST /api/auth/checkin
 */
import { POST, normalizeOrganizationDomain, resolveUserId, resolveAffiliation } from '../route'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'
import marketplaceJwtService from '@/utils/auth/marketplaceJwt'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { getPucFromSession } from '@/utils/webauthn/service'
import { NextResponse } from 'next/server'

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
    json: async () => ({ error: err.message }),
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

// ── Helpers ────────────────────────────────────────────────────────────────

const VALID_SESSION = {
  id: 'user-1',
  affiliation: 'university.edu',
  samlAssertion: '<xml>assertion</xml>',
}
const MOCK_AUTH_BASE = 'https://lab.example.com/auth'

function makeRequest(body = {}) {
  return { json: async () => body }
}

// ── Unit tests for pure helper functions ──────────────────────────────────

describe('normalizeOrganizationDomain', () => {
  it('throws on null or empty input', () => {
    expect(() => normalizeOrganizationDomain(null)).toThrow('Organization domain is required')
    expect(() => normalizeOrganizationDomain('')).toThrow('Organization domain is required')
  })

  it('throws on input that is too short', () => {
    expect(() => normalizeOrganizationDomain('ab')).toThrow('Invalid organization domain length')
  })

  it('throws on invalid characters', () => {
    expect(() => normalizeOrganizationDomain('bad domain!')).toThrow('Invalid character')
  })

  it('normalizes uppercase to lowercase', () => {
    expect(normalizeOrganizationDomain('Example.EDU')).toBe('example.edu')
  })

  it('accepts dots, dashes, and digits', () => {
    expect(normalizeOrganizationDomain('my-uni.org2')).toBe('my-uni.org2')
  })
})

describe('resolveUserId', () => {
  it('returns session.id when present', () => {
    expect(resolveUserId({ id: 'user-1' })).toBe('user-1')
  })

  it('falls back to eduPersonPrincipalName', () => {
    expect(resolveUserId({ eduPersonPrincipalName: 'eppn@uni.edu' })).toBe('eppn@uni.edu')
  })

  it('returns null for empty session', () => {
    expect(resolveUserId({})).toBeNull()
    expect(resolveUserId(null)).toBeNull()
  })
})

describe('resolveAffiliation', () => {
  it('returns session.affiliation when present', () => {
    expect(resolveAffiliation({ affiliation: 'member' })).toBe('member')
  })

  it('falls back to schacHomeOrganization', () => {
    expect(resolveAffiliation({ schacHomeOrganization: 'uni.edu' })).toBe('uni.edu')
  })

  it('returns null for empty session', () => {
    expect(resolveAffiliation({})).toBeNull()
  })
})

// ── POST /api/auth/checkin ─────────────────────────────────────────────────

describe('POST /api/auth/checkin', () => {
  let mockContract

  beforeEach(() => {
    jest.clearAllMocks()

    mockContract = {
      getLabAuthURI: jest.fn().mockResolvedValue(MOCK_AUTH_BASE + '/'),
      resolveSchacHomeOrganization: jest.fn().mockResolvedValue('0xProviderWallet'),
    }
    getContractInstance.mockResolvedValue(mockContract)
    requireAuth.mockResolvedValue(VALID_SESSION)
    marketplaceJwtService.isConfigured.mockResolvedValue(true)
    marketplaceJwtService.generateSamlAuthToken.mockResolvedValue('mock-jwt-token')
    getPucFromSession.mockReturnValue(null)

    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ accessGranted: true }),
    })
  })

  it('returns 400 when neither reservationKey nor labId is provided', async () => {
    const req = makeRequest({})
    const res = await POST(req)
    expect(handleGuardError).toHaveBeenCalled()
    expect(res.body.error).toMatch(/missing reservationkey or labid/i)
  })

  it('returns 400 when session has no samlAssertion', async () => {
    requireAuth.mockResolvedValue({ id: 'user-1', affiliation: 'uni.edu' })
    const req = makeRequest({ reservationKey: 'rk-1' })
    const res = await POST(req)
    expect(res.body.error).toMatch(/samlAssertion/i)
  })

  it('returns 400 when auth endpoint is missing/invalid', async () => {
    mockContract.getLabAuthURI.mockResolvedValue('')
    const req = makeRequest({ reservationKey: 'rk-1' })
    const res = await POST(req)
    expect(res.body.error).toMatch(/invalid auth endpoint/i)
  })

  it('returns 400 when marketplace JWT is not configured', async () => {
    marketplaceJwtService.isConfigured.mockResolvedValue(false)
    const req = makeRequest({ reservationKey: 'rk-1', authEndpoint: MOCK_AUTH_BASE })
    const res = await POST(req)
    expect(res.body.error).toMatch(/not configured/i)
  })

  it('returns 400 when institution wallet is not found (zero address)', async () => {
    mockContract.resolveSchacHomeOrganization.mockResolvedValue('0x0000000000000000000000000000000000000000')
    const req = makeRequest({ reservationKey: 'rk-1', authEndpoint: MOCK_AUTH_BASE })
    const res = await POST(req)
    expect(res.body.error).toMatch(/wallet not registered/i)
  })

  it('proxies downstream checkin response on success', async () => {
    const req = makeRequest({ reservationKey: 'rk-1', authEndpoint: MOCK_AUTH_BASE })
    const res = await POST(req)
    expect(fetch).toHaveBeenCalledWith(
      `${MOCK_AUTH_BASE}/checkin-institutional`,
      expect.objectContaining({ method: 'POST' }),
    )
    expect(res.status).toBe(200)
    expect(res.body.accessGranted).toBe(true)
  })

  it('returns downstream error status when checkin fails', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Lab unavailable',
    })
    const req = makeRequest({ reservationKey: 'rk-1', authEndpoint: MOCK_AUTH_BASE })
    const res = await POST(req)
    expect(res.status).toBe(503)
    expect(res.body.error).toMatch(/institutional check-in failed/i)
  })

  it('uses labId to resolve auth endpoint from contract', async () => {
    const req = makeRequest({ labId: '42' })
    await POST(req)
    expect(mockContract.getLabAuthURI).toHaveBeenCalledWith(42)
  })

  it('prefers authEndpoint from body over contract resolution', async () => {
    const req = makeRequest({ reservationKey: 'rk-1', authEndpoint: MOCK_AUTH_BASE })
    await POST(req)
    expect(mockContract.getLabAuthURI).not.toHaveBeenCalled()
  })
})
