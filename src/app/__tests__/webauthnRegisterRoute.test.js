/**
 * @jest-environment node
 */

import { requireAuth, handleGuardError } from '@/utils/auth/guards'
import { resolveInstitutionDomainFromSession } from '@/utils/auth/institutionDomain'
import { resolveInstitutionalBackendUrl } from '@/utils/onboarding/institutionalBackend'
import {
  getPucFromSession,
  registerCredentialInBackend,
  verifyRegistration,
} from '@/utils/webauthn/service'
import marketplaceJwtService from '@/utils/auth/marketplaceJwt'

jest.mock('@/utils/auth/guards', () => ({
  requireAuth: jest.fn(),
  handleGuardError: jest.fn((error) => Response.json({ error: error.message }, { status: 401 })),
}))

jest.mock('@/utils/auth/institutionDomain', () => ({
  resolveInstitutionDomainFromSession: jest.fn(),
}))

jest.mock('@/utils/onboarding/institutionalBackend', () => ({
  resolveInstitutionalBackendUrl: jest.fn(),
}))

jest.mock('@/utils/webauthn/service', () => ({
  getPucFromSession: jest.fn(),
  registerCredentialInBackend: jest.fn(),
  verifyRegistration: jest.fn(),
}))

jest.mock('@/utils/auth/marketplaceJwt', () => ({
  __esModule: true,
  default: {
    generateIntentBackendToken: jest.fn(),
  },
}))

describe('/api/auth/webauthn/register route', () => {
  const originalInstitutionBackendUrl = process.env.INSTITUTION_BACKEND_URL

  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.INSTITUTION_BACKEND_URL

    requireAuth.mockResolvedValue({
      id: 'user@uned.es|targeted-user',
      affiliation: 'uned.es',
      eduPersonPrincipalName: 'user@uned.es',
    })
    getPucFromSession.mockReturnValue('user@uned.es|targeted-user')
    verifyRegistration.mockResolvedValue({
      userId: 'user@uned.es|targeted-user',
      credentialId: 'cred-123',
      publicKeySpki: 'spki',
      signCount: 7,
      aaguid: 'aaguid-1',
      status: 'active',
    })
    registerCredentialInBackend.mockResolvedValue(true)
    marketplaceJwtService.generateIntentBackendToken.mockResolvedValue({ token: 'backend-token' })
  })

  afterAll(() => {
    if (originalInstitutionBackendUrl === undefined) {
      delete process.env.INSTITUTION_BACKEND_URL
    } else {
      process.env.INSTITUTION_BACKEND_URL = originalInstitutionBackendUrl
    }
  })

  test('mirrors credentials to the backend resolved from the institutional session', async () => {
    resolveInstitutionDomainFromSession.mockReturnValue('uned.es')
    resolveInstitutionalBackendUrl.mockResolvedValue('https://institution.example')

    const { POST } = await import('../api/auth/webauthn/register/route.js')
    const req = new Request('http://localhost/api/auth/webauthn/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attestation: { id: 'attestation' } }),
    })

    const res = await POST(req)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      registered: true,
      backendRegistered: true,
      credentialId: 'cred-123',
    })
    expect(resolveInstitutionalBackendUrl).toHaveBeenCalledWith('uned.es')
    expect(registerCredentialInBackend).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user@uned.es|targeted-user' }),
      'https://institution.example',
      { backendAuthToken: 'backend-token' },
    )
  })

  test('does not fall back to the global backend when the institution is known but unresolved', async () => {
    process.env.INSTITUTION_BACKEND_URL = 'https://global.example'
    resolveInstitutionDomainFromSession.mockReturnValue('uned.es')
    resolveInstitutionalBackendUrl.mockResolvedValue(null)

    const { POST } = await import('../api/auth/webauthn/register/route.js')
    const req = new Request('http://localhost/api/auth/webauthn/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attestation: { id: 'attestation' } }),
    })

    const res = await POST(req)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      registered: true,
      backendRegistered: false,
    })
    expect(registerCredentialInBackend).not.toHaveBeenCalled()
    expect(marketplaceJwtService.generateIntentBackendToken).not.toHaveBeenCalled()
  })

  test('falls back to the global backend only when no institution can be inferred', async () => {
    process.env.INSTITUTION_BACKEND_URL = 'https://global.example'
    resolveInstitutionDomainFromSession.mockReturnValue(null)

    const { POST } = await import('../api/auth/webauthn/register/route.js')
    const req = new Request('http://localhost/api/auth/webauthn/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attestation: { id: 'attestation' } }),
    })

    const res = await POST(req)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      registered: true,
      backendRegistered: true,
    })
    expect(resolveInstitutionalBackendUrl).not.toHaveBeenCalled()
    expect(registerCredentialInBackend).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user@uned.es|targeted-user' }),
      'https://global.example',
      { backendAuthToken: 'backend-token' },
    )
  })

  test('delegates auth guard failures to handleGuardError', async () => {
    const unauthorized = new Error('denied')
    unauthorized.name = 'UnauthorizedError'
    requireAuth.mockRejectedValue(unauthorized)
    resolveInstitutionDomainFromSession.mockReturnValue('uned.es')

    const { POST } = await import('../api/auth/webauthn/register/route.js')
    const req = new Request('http://localhost/api/auth/webauthn/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attestation: { id: 'attestation' } }),
    })

    const res = await POST(req)

    expect(handleGuardError).toHaveBeenCalledWith(unauthorized)
    expect(res.status).toBe(401)
  })
})
