/**
 * @jest-environment node
 */

const mockGetMarketplaceJwks = jest.fn()

jest.mock('@/utils/auth/marketplaceJwks', () => ({
  getMarketplaceJwks: mockGetMarketplaceJwks,
}))

describe('/.well-known/jwks.json route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns the active and previous verification keys with cache headers', async () => {
    const jwks = {
      keys: [
        { kty: 'RSA', n: 'active', e: 'AQAB', kid: 'active-kid', alg: 'RS256', use: 'sig' },
        { kty: 'RSA', n: 'previous', e: 'AQAB', kid: 'previous-kid', alg: 'RS256', use: 'sig' },
      ],
    }
    mockGetMarketplaceJwks.mockResolvedValue(jwks)

    const { GET } = await import('../.well-known/jwks.json/route.js')
    const response = await GET()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(response.headers.get('cache-control')).toBe('public, max-age=300, stale-while-revalidate=300')
    await expect(response.json()).resolves.toEqual(jwks)
  })

  test('fails closed when key material cannot be loaded', async () => {
    mockGetMarketplaceJwks.mockRejectedValue(new Error('invalid key'))

    const { GET } = await import('../.well-known/jwks.json/route.js')
    const response = await GET()

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Unable to serve Marketplace JWKS' })
  })
})
