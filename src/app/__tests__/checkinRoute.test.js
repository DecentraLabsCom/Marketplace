/**
 * @jest-environment node
 */

import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { requireAuth } from '@/utils/auth/guards'
import marketplaceJwtService from '@/utils/auth/marketplaceJwt'

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

describe('/api/auth/checkin route', () => {
  const originalFetch = global.fetch

  const buildSuccessfulResponse = () => ({
    ok: true,
    text: async () => JSON.stringify({ valid: true, sessionToken: 'checkin-token' }),
  })

  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  test('uses SAML-derived composite puc when present', async () => {
    requireAuth.mockResolvedValue({
      id: 'user-1@uned.es|targeted-user-1',
      samlAssertion: 'assert',
      affiliation: 'uned.es',
      eduPersonPrincipalName: 'user-1@uned.es',
      eduPersonTargetedID: 'targeted-user-1',
    })

    marketplaceJwtService.isConfigured.mockResolvedValue(true)
    marketplaceJwtService.generateSamlAuthToken.mockResolvedValue('marketplace-token')

    getContractInstance.mockResolvedValue({
      getLabAuthURI: jest.fn().mockResolvedValue('https://gateway.example.com/auth'),
      resolveSchacHomeOrganization: jest.fn().mockResolvedValue('0x1111111111111111111111111111111111111111'),
    })

    global.fetch.mockResolvedValue(buildSuccessfulResponse())

    const { POST } = await import('../api/auth/checkin/route.js')

    const req = new Request('http://localhost/api/auth/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reservationKey: '0xabc',
        labId: '10',
        authEndpoint: 'https://gateway.example.com/auth',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      valid: true,
      sessionToken: 'checkin-token',
    })

    expect(marketplaceJwtService.generateSamlAuthToken).toHaveBeenCalledWith(
      expect.objectContaining({
        puc: 'user-1@uned.es|targeted-user-1',
        purpose: 'lab_access',
        reservationKey: '0xabc',
        labId: '10',
        samlAssertionHash: expect.stringMatching(/^0x[a-fA-F0-9]{64}$/),
        stableUserIdMode: 'principal_targeted_id',
        audience: ['https://gateway.example.com', 'blockchain-services'],
      })
    )
  })

  test('uses eduPersonPrincipalName as puc when targeted id is missing', async () => {
    requireAuth.mockResolvedValue({
      samlAssertion: 'assert',
      affiliation: 'uned.es',
      eduPersonPrincipalName: 'user-2@uned.es',
    })

    marketplaceJwtService.isConfigured.mockResolvedValue(true)
    marketplaceJwtService.generateSamlAuthToken.mockResolvedValue('marketplace-token')

    getContractInstance.mockResolvedValue({
      getLabAuthURI: jest.fn().mockResolvedValue('https://gateway.example.com/auth'),
      resolveSchacHomeOrganization: jest.fn().mockResolvedValue('0x1111111111111111111111111111111111111111'),
    })

    global.fetch.mockResolvedValue(buildSuccessfulResponse())

    const { POST } = await import('../api/auth/checkin/route.js')

    const req = new Request('http://localhost/api/auth/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reservationKey: '0xabc',
        labId: '10',
        authEndpoint: 'https://gateway.example.com/auth',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      valid: true,
      sessionToken: 'checkin-token',
    })

    expect(marketplaceJwtService.generateSamlAuthToken).toHaveBeenCalledWith(
      expect.objectContaining({
        puc: 'user-2@uned.es',
      })
    )
  })

  test('preserves 202 when the backend accepts the check-in into its queue', async () => {
    requireAuth.mockResolvedValue({
      samlAssertion: 'assert',
      affiliation: 'uned.es',
      eduPersonPrincipalName: 'user-queued@uned.es',
    })

    marketplaceJwtService.isConfigured.mockResolvedValue(true)
    marketplaceJwtService.generateSamlAuthToken.mockResolvedValue('marketplace-token')
    getContractInstance.mockResolvedValue({
      getLabAuthURI: jest.fn().mockResolvedValue('https://gateway.example.com/auth'),
      resolveSchacHomeOrganization: jest.fn().mockResolvedValue('0x1111111111111111111111111111111111111111'),
    })
    global.fetch.mockResolvedValue({
      ok: true,
      status: 202,
      headers: new Headers({ 'Retry-After': '2' }),
      text: async () => JSON.stringify({ valid: true, queued: true, reason: 'CHECKIN_QUEUED' }),
    })

    const { POST } = await import('../api/auth/checkin/route.js')
    const res = await POST(new Request('http://localhost/api/auth/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reservationKey: '0xabc', labId: '10' }),
    }))

    expect(res.status).toBe(202)
    expect(res.headers.get('Retry-After')).toBe('2')
    await expect(res.json()).resolves.toMatchObject({
      queued: true,
      reason: 'CHECKIN_QUEUED',
    })
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
    marketplaceJwtService.generateSamlAuthToken.mockResolvedValue('marketplace-token')

    getContractInstance.mockResolvedValue({
      getLabAuthURI: jest.fn().mockResolvedValue('https://gateway.example.com/auth'),
      resolveSchacHomeOrganization: jest.fn().mockResolvedValue('0x1111111111111111111111111111111111111111'),
    })

    global.fetch.mockResolvedValue(buildSuccessfulResponse())

    const { POST } = await import('../api/auth/checkin/route.js')

    const req = new Request('http://localhost/api/auth/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reservationKey: '0xabc',
        labId: '10',
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

  test('rejects auth endpoint that does not match on-chain gateway', async () => {
    requireAuth.mockResolvedValue({
      samlAssertion: 'assert',
      affiliation: 'uned.es',
      eduPersonPrincipalName: 'user-1@uned.es',
    })

    getContractInstance.mockResolvedValue({
      getLabAuthURI: jest.fn().mockResolvedValue('https://gateway.example.com/auth'),
    })

    const { POST } = await import('../api/auth/checkin/route.js')

    const req = new Request('http://localhost/api/auth/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reservationKey: '0xabc',
        labId: '10',
        authEndpoint: 'https://evil.example.com/auth',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      error: 'The provider access endpoint is invalid.',
      code: 'BAD_REQUEST',
    })
  })
})
