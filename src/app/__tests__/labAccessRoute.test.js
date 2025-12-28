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

describe('/api/auth/lab-access route', () => {
  const originalFetch = global.fetch

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
    requireAuth.mockResolvedValue({ userid: 'user' })

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
      userid: 'user',
    })
    marketplaceJwtService.isConfigured.mockResolvedValue(true)

    getContractInstance.mockResolvedValue({
      resolveSchacHomeOrganization: jest.fn().mockResolvedValue('0x0000000000000000000000000000000000000000'),
    })

    const { POST } = await import('../api/auth/lab-access/route.js')

    const req = new Request('http://localhost/api/auth/lab-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ labId: '1', authEndpoint: 'https://gateway.example.com' }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      error: 'Institution wallet not registered',
      code: 'BAD_REQUEST',
    })
  })

  test('authenticates via saml-auth2 when request is valid', async () => {
    requireAuth.mockResolvedValue({
      samlAssertion: 'assert',
      affiliation: 'uned.es',
      userid: 'user-1',
      personalUniqueCode: 'puc-1',
    })

    marketplaceJwtService.isConfigured.mockResolvedValue(true)
    marketplaceJwtService.generateSamlAuthToken.mockResolvedValue('marketplace-token')

    getContractInstance.mockResolvedValue({
      resolveSchacHomeOrganization: jest.fn().mockResolvedValue('0x1111111111111111111111111111111111111111'),
    })

    global.fetch.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ token: 'jwt', labURL: 'https://lab.example.com' }),
    })

    const { POST } = await import('../api/auth/lab-access/route.js')

    const req = new Request('http://localhost/api/auth/lab-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        labId: '10',
        reservationKey: '0xabc',
        authEndpoint: 'https://gateway.example.com',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      token: 'jwt',
      labURL: 'https://lab.example.com',
    })

    expect(global.fetch).toHaveBeenCalledWith(
      'https://gateway.example.com/auth/saml-auth2',
      expect.objectContaining({ method: 'POST' })
    )
  })

  test('authenticates via saml-auth2 with labId only', async () => {
    requireAuth.mockResolvedValue({
      samlAssertion: 'assert',
      affiliation: 'uned.es',
      userid: 'user-1',
      personalUniqueCode: 'puc-1',
    })

    marketplaceJwtService.isConfigured.mockResolvedValue(true)
    marketplaceJwtService.generateSamlAuthToken.mockResolvedValue('marketplace-token')

    const getLabAuthURI = jest.fn().mockResolvedValue('https://gateway.example.com')

    getContractInstance.mockResolvedValue({
      getLabAuthURI,
      resolveSchacHomeOrganization: jest.fn().mockResolvedValue('0x1111111111111111111111111111111111111111'),
    })

    global.fetch.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ token: 'jwt', labURL: 'https://lab.example.com' }),
    })

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
      token: 'jwt',
      labURL: 'https://lab.example.com',
    })

    expect(getLabAuthURI).toHaveBeenCalledWith(10)
    expect(global.fetch).toHaveBeenCalledWith(
      'https://gateway.example.com/auth/saml-auth2',
      expect.objectContaining({ method: 'POST' })
    )
  })

  test('authenticates via saml-auth2 with reservationKey only', async () => {
    requireAuth.mockResolvedValue({
      samlAssertion: 'assert',
      affiliation: 'uned.es',
      userid: 'user-1',
    })

    marketplaceJwtService.isConfigured.mockResolvedValue(true)
    marketplaceJwtService.generateSamlAuthToken.mockResolvedValue('marketplace-token')

    getContractInstance.mockResolvedValue({
      resolveSchacHomeOrganization: jest.fn().mockResolvedValue('0x1111111111111111111111111111111111111111'),
    })

    global.fetch.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ token: 'jwt', labURL: 'https://lab.example.com' }),
    })

    const { POST } = await import('../api/auth/lab-access/route.js')

    const req = new Request('http://localhost/api/auth/lab-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reservationKey: '0xabc',
        authEndpoint: 'https://gateway.example.com',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      token: 'jwt',
      labURL: 'https://lab.example.com',
    })

    expect(global.fetch).toHaveBeenCalledWith(
      'https://gateway.example.com/auth/saml-auth2',
      expect.objectContaining({ method: 'POST' })
    )
  })
})
