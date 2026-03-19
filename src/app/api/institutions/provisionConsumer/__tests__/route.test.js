/**
 * Tests for POST /api/institutions/provisionConsumer
 * Admin role restricted consumer provisioning token generation.
 */
import { POST } from '../route'
import { requireAuth } from '@/utils/auth/guards'
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
  requireString: jest.fn((s) => { if(!s) throw new Error('Missing string'); return s }),
  signProvisioningToken: jest.fn(),
}))

function makeRequest(body) {
  return { json: async () => body, nextUrl: { origin: 'https://marketplace.com' } }
}

describe('POST /api/institutions/provisionConsumer', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    requireAuth.mockResolvedValue({ samlAssertion: true, role: 'admin', name: 'Admin User' })
    hasAdminRole.mockReturnValue(true)
    resolveInstitutionDomainFromSession.mockReturnValue('consumer.edu')
    signProvisioningToken.mockResolvedValue({ token: 'jwt.consumer.token', expiresAt: 2000 })
  })

  it('returns 403 if not SSO session', async () => {
    requireAuth.mockResolvedValue({ samlAssertion: false })
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(403)
  })

  it('generates token successfully with type consumer', async () => {
    const res = await POST(makeRequest({ publicBaseUrl: 'https://backend.consumer.edu' }))
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.token).toBe('jwt.consumer.token')
    expect(res.body.payload.type).toBe('consumer')
    expect(res.body.payload.consumerOrganization).toBe('consumer.edu')
  })
})
