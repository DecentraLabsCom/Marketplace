/**
 * @jest-environment node
 */

import { GET } from '../route'
import { getMarketCatalogueSnapshot } from '@/server/market/getMarketCatalogueSnapshot'

jest.mock('@/server/market/getMarketCatalogueSnapshot', () => ({
  getMarketCatalogueSnapshot: jest.fn(),
  MARKET_CATALOGUE_STATUS: {
    FRESH: 'fresh',
    STALE: 'stale',
    UNAVAILABLE: 'unavailable',
  },
  toPublicMarketSnapshot: jest.fn(({ metrics, ...snapshot }) => snapshot),
}))

describe('GET /api/market/labs', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getMarketCatalogueSnapshot.mockResolvedValue({
      labs: [{ id: 7, name: 'Public Lab' }],
      totalLabs: 1,
      snapshotAt: '2026-07-15T00:00:00.000Z',
    })
  })

  test('requests the listed-only DTO by default and adds public caching', async () => {
    const response = await GET({
      nextUrl: new URL('https://market.example/api/market/labs'),
    })

    expect(getMarketCatalogueSnapshot).toHaveBeenCalledWith({
      includeUnlisted: false,
      cursor: 0,
      limit: 24,
      filters: {},
    })
    expect(response.headers.get('Cache-Control')).toContain('s-maxage=60')
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ totalLabs: 1 }))
  })

  test('passes the explicit includeUnlisted flag without exposing a client path to raw contract data', async () => {
    await GET({
      nextUrl: new URL('https://market.example/api/market/labs?includeUnlisted=true'),
    })

    expect(getMarketCatalogueSnapshot).toHaveBeenCalledWith({
      includeUnlisted: true,
      cursor: 0,
      limit: 24,
      filters: {},
    })
  })

  test('passes cursor pages and rejects malformed pagination', async () => {
    await GET({
      nextUrl: new URL('https://market.example/api/market/labs?cursor=24&limit=12'),
    })

    expect(getMarketCatalogueSnapshot).toHaveBeenCalledWith({
      includeUnlisted: false,
      cursor: 24,
      limit: 12,
      filters: {},
    })

    const response = await GET({
      nextUrl: new URL('https://market.example/api/market/labs?cursor=bad'),
    })

    expect(response.status).toBe(400)
    expect(getMarketCatalogueSnapshot).toHaveBeenCalledTimes(1)
  })

  test('returns a non-cacheable 503 when no valid catalogue snapshot exists', async () => {
    getMarketCatalogueSnapshot.mockResolvedValue({
      labs: [],
      totalLabs: 0,
      returnedLabs: 0,
      cursor: 0,
      limit: 24,
      nextCursor: null,
      snapshotAt: null,
      catalogueStatus: 'unavailable',
      errorCode: 'MARKET_CATALOGUE_UNAVAILABLE',
    })

    const response = await GET({
      nextUrl: new URL('https://market.example/api/market/labs'),
    })

    expect(response.status).toBe(503)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      catalogueStatus: 'unavailable',
      errorCode: 'MARKET_CATALOGUE_UNAVAILABLE',
    }))
  })

  test('does not CDN-cache a stale fallback snapshot', async () => {
    getMarketCatalogueSnapshot.mockResolvedValue({
      labs: [{ id: 7, name: 'Last valid lab' }],
      totalLabs: 1,
      returnedLabs: 1,
      cursor: 0,
      limit: 24,
      nextCursor: null,
      snapshotAt: '2026-07-15T10:42:00.000Z',
      catalogueStatus: 'stale',
    })

    const response = await GET({
      nextUrl: new URL('https://market.example/api/market/labs'),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  test('validates and forwards server-side search and filter parameters', async () => {
    await GET({
      nextUrl: new URL('https://market.example/api/market/labs?q=quantum&searchField=keyword&category=Physics&provider=Provider%20University&resourceType=lab&sort=price_asc'),
    })

    expect(getMarketCatalogueSnapshot).toHaveBeenCalledWith({
      includeUnlisted: false,
      cursor: 0,
      limit: 24,
      filters: {
        q: 'quantum',
        searchField: 'keyword',
        category: 'Physics',
        provider: 'Provider University',
        resourceType: 'lab',
        sort: 'price_asc',
      },
    })

    const malformed = await GET({
      nextUrl: new URL('https://market.example/api/market/labs?resourceType=other'),
    })
    expect(malformed.status).toBe(400)
  })
})
