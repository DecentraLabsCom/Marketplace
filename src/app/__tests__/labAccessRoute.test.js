/**
 * @jest-environment node
 */

import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { requireAuth } from '@/utils/auth/guards'
import marketplaceJwtService from '@/utils/auth/marketplaceJwt'
import { resolveInstitutionalBackendUrl } from '@/utils/onboarding/institutionalBackend'

jest.mock('@/utils/auth/guards', () => {
  const actual = jest.requireActual('@/utils/auth/guards')
  return { ...actual, requireAuth: jest.fn() }
})

jest.mock('@/app/api/contract/utils/contractInstance', () => ({
  getContractInstance: jest.fn(),
}))

jest.mock('@/utils/auth/marketplaceJwt', () => ({
  __esModule: true,
  default: {
    isConfigured: jest.fn(),
    generateSamlAuthToken: jest.fn(),
  },
}))

jest.mock('@/utils/onboarding/institutionalBackend', () => ({
  resolveInstitutionalBackendUrl: jest.fn(),
}))

describe('/api/auth/lab-access route', () => {
  const originalFetch = global.fetch

  const buildSuccessfulResponse = () => ({
    ok: true,
    text: async () => JSON.stringify({ token: 'jwt', labURL: 'https://lab.example.com' }),
  })

  const buildAccessCodeResponse = () => ({
    ok: true,
    text: async () => JSON.stringify({ accessCode: 'opaque-code', labURL: 'https://lab.example.com' }),
  })

  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  test('returns 400 when labId and reservationKey are missing', async () => {
    requireAuth.mockResolvedValue({ samlAssertion: 'assert' })

    const { POST } = await import('../api/auth/lab-access/route.js')

    const req = new Request('http://localhost/api/auth/lab-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      error: 'Missing labId or reservationKey',
      code: 'BAD_REQUEST',
    })
  })

  test('returns 400 when SSO session is missing', async () => {
    requireAuth.mockResolvedValue({ puc: 'user' })

    const { POST } = await import('../api/auth/lab-access/route.js')

    const req = new Request('http://localhost/api/auth/lab-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ labId: '1' }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      error: 'Missing SSO session',
      code: 'BAD_REQUEST',
    })
  })

  test('returns 400 when institution wallet is not registered', async () => {
    requireAuth.mockResolvedValue({
      samlAssertion: 'assert',
      affiliation: 'uned.es',
      eduPersonPrincipalName: 'user@uned.es',
    })
    marketplaceJwtService.isConfigured.mockResolvedValue(true)

    getContractInstance.mockResolvedValue({
      getLabAuthURI: jest.fn().mockResolvedValue('https://gateway.example.com/auth'),
      resolveSchacHomeOrganization: jest.fn().mockResolvedValue('0x0000000000000000000000000000000000000000'),
    })

    const { POST } = await import('../api/auth/lab-access/route.js')

    const req = new Request('http://localhost/api/auth/lab-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ labId: '1', authEndpoint: 'https://gateway.example.com/auth' }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      error: 'Institution wallet not registered',
      code: 'BAD_REQUEST',
    })
  })

  test('authorizes access with consumer backend before requesting provider credential', async () => {
    requireAuth.mockResolvedValue({
      id: 'user-1@uned.es|targeted-user-1',
      samlAssertion: 'assert',
      affiliation: 'uned.es',
      eduPersonPrincipalName: 'user-1@uned.es',
      eduPersonTargetedID: 'targeted-user-1',
    })

    marketplaceJwtService.isConfigured.mockResolvedValue(true)
    marketplaceJwtService.generateSamlAuthToken
      .mockResolvedValueOnce('consumer-marketplace-token')
      .mockResolvedValueOnce('provider-marketplace-token')
    resolveInstitutionalBackendUrl.mockResolvedValue('https://consumer.example.com')

    getContractInstance.mockResolvedValue({
      getLabAuthURI: jest.fn().mockResolvedValue('https://gateway.example.com/auth'),
      resolveSchacHomeOrganization: jest.fn().mockResolvedValue('0x1111111111111111111111111111111111111111'),
    })

    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ valid: true, reservationKey: '0xabc' }),
      })
      .mockResolvedValueOnce(buildSuccessfulResponse())
      .mockResolvedValueOnce(buildAccessCodeResponse())

    const { POST } = await import('../api/auth/lab-access/route.js')

    const req = new Request('http://localhost/api/auth/lab-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        labId: '10',
        reservationKey: '0xabc',
        authEndpoint: 'https://gateway.example.com/auth',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      accessCode: 'opaque-code',
      labURL: 'https://lab.example.com',
    })

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      'https://consumer.example.com/auth/checkin-institutional',
      expect.objectContaining({ method: 'POST' })
    )
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'https://gateway.example.com/auth/access-credential',
      expect.objectContaining({ method: 'POST' })
    )
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).marketplaceToken).toBe('consumer-marketplace-token')
    expect(JSON.parse(global.fetch.mock.calls[1][1].body).marketplaceToken).toBe('provider-marketplace-token')
    expect(marketplaceJwtService.generateSamlAuthToken).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ audience: ['https://consumer.example.com', 'blockchain-services'] })
    )
    expect(marketplaceJwtService.generateSamlAuthToken).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ audience: ['https://gateway.example.com', 'blockchain-services'] })
    )
    expect(marketplaceJwtService.generateSamlAuthToken).toHaveBeenCalledWith(
      expect.objectContaining({
        puc: 'user-1@uned.es|targeted-user-1',
        purpose: 'lab_access',
        reservationKey: '0xabc',
        labId: '10',
        samlAssertionHash: expect.stringMatching(/^0x[a-fA-F0-9]{64}$/),
        stableUserIdMode: 'principal_targeted_id',
      })
    )
  })

  test('uses authorize-and-issue once when consumer and provider share a backend', async () => {
    requireAuth.mockResolvedValue({
      samlAssertion: 'assert',
      affiliation: 'uned.es',
      eduPersonPrincipalName: 'user-1@uned.es',
    })
    marketplaceJwtService.isConfigured.mockResolvedValue(true)
    marketplaceJwtService.generateSamlAuthToken.mockResolvedValue('marketplace-token')
    resolveInstitutionalBackendUrl.mockResolvedValue('https://gateway.example.com')
    getContractInstance.mockResolvedValue({
      getLabAuthURI: jest.fn().mockResolvedValue('https://gateway.example.com/auth'),
      resolveSchacHomeOrganization: jest.fn().mockResolvedValue('0x1111111111111111111111111111111111111111'),
    })
    global.fetch
      .mockResolvedValueOnce(buildSuccessfulResponse())
      .mockResolvedValueOnce(buildAccessCodeResponse())

    const { POST } = await import('../api/auth/lab-access/route.js')
    const res = await POST(new Request('http://localhost/api/auth/lab-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ labId: '10', reservationKey: '0xabc' }),
    }))

    expect(res.status).toBe(200)
    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(global.fetch).toHaveBeenCalledWith(
      'https://gateway.example.com/auth/authorize-and-issue',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toMatchObject({
      marketplaceToken: 'marketplace-token',
      samlAssertion: 'assert',
      reservationKey: '0xabc',
      labId: '10',
    })
  })

  test('uses eduPersonPrincipalName as puc when targeted id is missing', async () => {
    requireAuth.mockResolvedValue({
      samlAssertion: 'assert',
      affiliation: 'uned.es',
      eduPersonPrincipalName: 'user-2@uned.es',
    })

    marketplaceJwtService.isConfigured.mockResolvedValue(true)
    marketplaceJwtService.generateSamlAuthToken.mockResolvedValue('marketplace-token')
    resolveInstitutionalBackendUrl.mockResolvedValue('https://consumer.example.com')

    getContractInstance.mockResolvedValue({
      getLabAuthURI: jest.fn().mockResolvedValue('https://gateway.example.com/auth'),
      resolveSchacHomeOrganization: jest.fn().mockResolvedValue('0x1111111111111111111111111111111111111111'),
    })

    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ valid: true, reservationKey: '0xabc' }),
      })
      .mockResolvedValueOnce(buildSuccessfulResponse())
      .mockResolvedValueOnce(buildAccessCodeResponse())

    const { POST } = await import('../api/auth/lab-access/route.js')

    const req = new Request('http://localhost/api/auth/lab-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        labId: '10',
        reservationKey: '0xabc',
        authEndpoint: 'https://gateway.example.com/auth',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      accessCode: 'opaque-code',
      labURL: 'https://lab.example.com',
    })

    expect(marketplaceJwtService.generateSamlAuthToken).toHaveBeenCalledWith(
      expect.objectContaining({
        puc: 'user-2@uned.es',
      })
    )
  })

  test('uses only SAML-derived puc and ignores stale session id', async () => {
    requireAuth.mockResolvedValue({
      id: 'legacy-user-id',
      samlAssertion: 'assert',
      affiliation: 'uned.es',
      eduPersonPrincipalName: 'user-3@uned.es',
      eduPersonTargetedID: 'targeted-user-3',
    })

    marketplaceJwtService.isConfigured.mockResolvedValue(true)
    marketplaceJwtService.generateSamlAuthToken
      .mockResolvedValueOnce('consumer-marketplace-token')
      .mockResolvedValueOnce('provider-marketplace-token')
    resolveInstitutionalBackendUrl.mockResolvedValue('https://consumer.example.com')

    getContractInstance.mockResolvedValue({
      getLabAuthURI: jest.fn().mockResolvedValue('https://gateway.example.com/auth'),
      resolveSchacHomeOrganization: jest.fn().mockResolvedValue('0x1111111111111111111111111111111111111111'),
    })

    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ valid: true, reservationKey: '0xabc' }),
      })
      .mockResolvedValueOnce(buildSuccessfulResponse())
      .mockResolvedValueOnce(buildAccessCodeResponse())

    const { POST } = await import('../api/auth/lab-access/route.js')

    const req = new Request('http://localhost/api/auth/lab-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        labId: '10',
        reservationKey: '0xabc',
        authEndpoint: 'https://gateway.example.com/auth',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    expect(marketplaceJwtService.generateSamlAuthToken).toHaveBeenCalledWith(
      expect.objectContaining({
        puc: 'user-3@uned.es|targeted-user-3',
      })
    )
  })

  test('authenticates via the provider access credential endpoint with labId only', async () => {
    requireAuth.mockResolvedValue({
      samlAssertion: 'assert',
      affiliation: 'uned.es',
      eduPersonPrincipalName: 'user-1@uned.es',
    })

    marketplaceJwtService.isConfigured.mockResolvedValue(true)
    marketplaceJwtService.generateSamlAuthToken.mockResolvedValue('marketplace-token')
    resolveInstitutionalBackendUrl.mockResolvedValue('https://consumer.example.com')

    const getLabAuthURI = jest.fn().mockResolvedValue('https://gateway.example.com/auth')

    getContractInstance.mockResolvedValue({
      getLabAuthURI,
      resolveSchacHomeOrganization: jest.fn().mockResolvedValue('0x1111111111111111111111111111111111111111'),
    })

    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ valid: true, reservationKey: '0xabc' }),
      })
      .mockResolvedValueOnce(buildSuccessfulResponse())
      .mockResolvedValueOnce(buildAccessCodeResponse())

    const { POST } = await import('../api/auth/lab-access/route.js')

    const req = new Request('http://localhost/api/auth/lab-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        labId: '10',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      accessCode: 'opaque-code',
      labURL: 'https://lab.example.com',
    })

    expect(getLabAuthURI).toHaveBeenCalledWith(10)
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'https://gateway.example.com/auth/access-credential',
      expect.objectContaining({ method: 'POST' })
    )
  })

  test('rejects auth endpoint that does not match on-chain gateway', async () => {
    requireAuth.mockResolvedValue({
      samlAssertion: 'assert',
      affiliation: 'uned.es',
      eduPersonPrincipalName: 'user-1@uned.es',
    })

    getContractInstance.mockResolvedValue({
      getLabAuthURI: jest.fn().mockResolvedValue('https://gateway.example.com/auth'),
    })

    const { POST } = await import('../api/auth/lab-access/route.js')

    const req = new Request('http://localhost/api/auth/lab-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        labId: '10',
        reservationKey: '0xabc',
        authEndpoint: 'https://evil.example.com/auth',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      error: 'Provided gatewayUrl does not match on-chain lab auth URI',
      code: 'BAD_REQUEST',
    })
  })

  test('requests provider credential with reservationKey and labId', async () => {
    requireAuth.mockResolvedValue({
      samlAssertion: 'assert',
      affiliation: 'uned.es',
      eduPersonPrincipalName: 'user-1@uned.es',
    })

    marketplaceJwtService.isConfigured.mockResolvedValue(true)
    marketplaceJwtService.generateSamlAuthToken.mockResolvedValue('marketplace-token')
    resolveInstitutionalBackendUrl.mockResolvedValue('https://consumer.example.com')

    getContractInstance.mockResolvedValue({
      getLabAuthURI: jest.fn().mockResolvedValue('https://gateway.example.com/auth'),
      resolveSchacHomeOrganization: jest.fn().mockResolvedValue('0x1111111111111111111111111111111111111111'),
    })

    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ valid: true, reservationKey: '0xabc' }),
      })
      .mockResolvedValueOnce(buildSuccessfulResponse())
      .mockResolvedValueOnce(buildAccessCodeResponse())

    const { POST } = await import('../api/auth/lab-access/route.js')

    const req = new Request('http://localhost/api/auth/lab-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        labId: '10',
        reservationKey: '0xabc',
        authEndpoint: 'https://gateway.example.com/auth',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      accessCode: 'opaque-code',
      labURL: 'https://lab.example.com',
    })

    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'https://gateway.example.com/auth/access-credential',
      expect.objectContaining({ method: 'POST' })
    )
  })
})
