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

  test('uses composite session id when present', async () => {
    requireAuth.mockResolvedValue({
      id: 'user-1@uned.es|targeted-user-1',
      samlAssertion: 'assert',
      affiliation: 'uned.es',
      eduPersonPrincipalName: 'user-1@uned.es',
    })

    marketplaceJwtService.isConfigured.mockResolvedValue(true)
    marketplaceJwtService.generateSamlAuthToken.mockResolvedValue('marketplace-token')

    getContractInstance.mockResolvedValue({
      resolveSchacHomeOrganization: jest.fn().mockResolvedValue('0x1111111111111111111111111111111111111111'),
    })

    global.fetch.mockResolvedValue(buildSuccessfulResponse())

    const { POST } = await import('../api/auth/checkin/route.js')

    const req = new Request('http://localhost/api/auth/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reservationKey: '0xabc',
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
        userId: 'user-1@uned.es|targeted-user-1',
      })
    )
  })

  test('falls back to eduPersonPrincipalName when composite session id is missing', async () => {
    requireAuth.mockResolvedValue({
      samlAssertion: 'assert',
      affiliation: 'uned.es',
      eduPersonPrincipalName: 'user-2@uned.es',
    })

    marketplaceJwtService.isConfigured.mockResolvedValue(true)
    marketplaceJwtService.generateSamlAuthToken.mockResolvedValue('marketplace-token')

    getContractInstance.mockResolvedValue({
      resolveSchacHomeOrganization: jest.fn().mockResolvedValue('0x1111111111111111111111111111111111111111'),
    })

    global.fetch.mockResolvedValue(buildSuccessfulResponse())

    const { POST } = await import('../api/auth/checkin/route.js')

    const req = new Request('http://localhost/api/auth/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reservationKey: '0xabc',
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
        userId: 'user-2@uned.es',
      })
    )
  })
})
