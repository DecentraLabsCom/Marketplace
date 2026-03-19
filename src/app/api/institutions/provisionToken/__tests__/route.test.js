/**
 * Tests for POST /api/institutions/provisionToken
 * Admin role restricted provisioning token generation.
 */
import { POST } from '../route'
import { requireAuth, ForbiddenError } from '@/utils/auth/guards'
import { hasAdminRole } from '@/utils/auth/roleValidation'
import { resolveInstitutionDomainFromSession } from '@/utils/auth/institutionDomain'
import { signProvisioningToken } from '@/utils/auth/provisioningToken'

jest.mock('@/utils/dev/logger', () => {
  const m = { log: jest.fn(), warn: jest.fn(), error: jest.fn() }
  return { __esModule: true, default: m, devLog: m, log: m.log, warn: m.warn, error: m.error }
})
jest.mock('next/server', () => ({
  NextResponse: { json: jest.fn((data, init) => ({ status: init?.status ?? 200, body: data })) }
}))
jest.mock('@/utils/auth/guards', () => {
  class HttpError extends Error { constructor(m, s) { super(m); this.name = 'HttpError'; this.status = s } }
  class ForbiddenError extends HttpError { constructor(m) { super(m, 403); this.name = 'ForbiddenError' } }
  return { requireAuth: jest.fn(), ForbiddenError, HttpError }
})
jest.mock('@/utils/auth/roleValidation', () => ({ hasAdminRole: jest.fn() }))
jest.mock('@/utils/auth/institutionDomain', () => ({ resolveInstitutionDomainFromSession: jest.fn() }))
jest.mock('@/utils/auth/provisioningToken', () => ({
  normalizeHttpsUrl: jest.fn((u) => u ? (u.startsWith('http') ? u : `https://${u}`) : null),
  requireEmail: jest.fn((e) => { if(!e) throw new Error('Missing email'); return e }),
  requireString: jest.fn((s) => { if(!s) throw new Error('Missing string'); return s }),
  signProvisioningToken: jest.fn(),
}))

function makeRequest(body) {
  const req = { json: async () => body, nextUrl: { origin: 'https://marketplace.com' } }
  return req
}

describe('POST /api/institutions/provisionToken', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    requireAuth.mockResolvedValue({
      samlAssertion: true,
      role: 'admin',
      email: 'admin@uni.edu',
      name: 'Admin User'
    })
    hasAdminRole.mockReturnValue(true)
    resolveInstitutionDomainFromSession.mockReturnValue('uni.edu')
    signProvisioningToken.mockResolvedValue({ token: 'jwt.mock.token', expiresAt: 1000 })
  })

  it('returns 403 if not SSO session', async () => {
    requireAuth.mockResolvedValue({ samlAssertion: false })
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/requires SSO session/)
  })

  it('returns 403 if not admin', async () => {
    hasAdminRole.mockReturnValue(false)
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(403)
  })

  it('returns 400 if validation fails (e.g. missing string)', async () => {
    // resolveInstitutionDomainFromSession returning null throws 403, but let's test a 400 for requireEmail
    requireAuth.mockResolvedValue({ samlAssertion: true, role: 'admin' }) // No email in session
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400) // Missing email
  })

  it('generates token successfully with valid payload', async () => {
    const res = await POST(makeRequest({ publicBaseUrl: 'https://backend.uni.edu' }))
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.token).toBe('jwt.mock.token')
    expect(res.body.payload.providerOrganization).toBe('uni.edu')
  })
})
