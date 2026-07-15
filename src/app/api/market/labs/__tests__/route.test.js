/**
 * @jest-environment node
 */

import { GET } from '../route'
import { getMarketLabsSnapshot } from '@/server/market/getMarketLabsSnapshot'

jest.mock('@/server/market/getMarketLabsSnapshot', () => ({
  getMarketLabsSnapshot: jest.fn(),
  toPublicMarketSnapshot: jest.fn(({ metrics, ...snapshot }) => snapshot),
}))

describe('GET /api/market/labs', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getMarketLabsSnapshot.mockResolvedValue({
      labs: [{ id: 7, name: 'Public Lab' }],
      totalLabs: 1,
      snapshotAt: '2026-07-15T00:00:00.000Z',
    })
  })

  test('requests the listed-only DTO by default and adds public caching', async () => {
    const response = await GET({
      nextUrl: new URL('https://market.example/api/market/labs'),
    })

    expect(getMarketLabsSnapshot).toHaveBeenCalledWith({
      includeUnlisted: false,
      cursor: 0,
      limit: 24,
    })
    expect(response.headers.get('Cache-Control')).toContain('s-maxage=60')
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ totalLabs: 1 }))
  })

  test('passes the explicit includeUnlisted flag without exposing a client path to raw contract data', async () => {
    await GET({
      nextUrl: new URL('https://market.example/api/market/labs?includeUnlisted=true'),
    })

    expect(getMarketLabsSnapshot).toHaveBeenCalledWith({
      includeUnlisted: true,
      cursor: 0,
      limit: 24,
    })
  })

  test('passes cursor pages and rejects malformed pagination', async () => {
    await GET({
      nextUrl: new URL('https://market.example/api/market/labs?cursor=24&limit=12'),
    })

    expect(getMarketLabsSnapshot).toHaveBeenCalledWith({
      includeUnlisted: false,
      cursor: 24,
      limit: 12,
    })

    const response = await GET({
      nextUrl: new URL('https://market.example/api/market/labs?cursor=bad'),
    })

    expect(response.status).toBe(400)
    expect(getMarketLabsSnapshot).toHaveBeenCalledTimes(1)
  })
})
