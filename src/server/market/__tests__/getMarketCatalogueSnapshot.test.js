/**
 * @jest-environment node
 */

jest.mock('../getMarketLabsSnapshot', () => ({
  getMarketLabsSnapshot: jest.fn(),
  MARKET_CATALOGUE_STATUS: {
    FRESH: 'fresh',
    STALE: 'stale',
    UNAVAILABLE: 'unavailable',
  },
}))

import { getMarketLabsSnapshot } from '../getMarketLabsSnapshot'
import { getMarketCatalogueSnapshot } from '../getMarketCatalogueSnapshot'

const lab = (id, overrides = {}) => ({
  id,
  name: `Lab ${id}`,
  provider: 'Provider A',
  category: ['Engineering'],
  keywords: [],
  description: '',
  price: '100',
  resourceType: 0,
  isListed: true,
  ...overrides,
})

const snapshot = ({ labs, totalLabs, cursor, catalogueStatus = 'fresh' }) => ({
  labs,
  totalLabs,
  returnedLabs: labs.length,
  cursor,
  limit: 100,
  nextCursor: cursor + labs.length < totalLabs ? String(cursor + labs.length) : null,
  snapshotAt: '2026-07-16T10:42:00.000Z',
  catalogueStatus,
})

const deferred = () => {
  let resolve
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('getMarketCatalogueSnapshot', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('searches and filters the complete server catalogue before cursor pagination', async () => {
    getMarketLabsSnapshot
      .mockResolvedValueOnce(snapshot({
        cursor: 0,
        totalLabs: 101,
        labs: [
          lab(1, { name: 'Chemistry lab', provider: 'Provider B', price: '900' }),
          lab(2, { name: 'Quantum optics', provider: 'Provider C', category: ['Physics'], price: '300' }),
        ],
      }))
      .mockResolvedValueOnce(snapshot({
        cursor: 100,
        totalLabs: 101,
        labs: [
          lab(101, { name: 'Quantum simulation', provider: 'Provider D', category: ['Physics'], price: '100' }),
        ],
      }))

    const result = await getMarketCatalogueSnapshot({
      includeUnlisted: false,
      cursor: 0,
      limit: 1,
      filters: { q: 'quantum', category: 'Physics', sort: 'price_asc' },
    })

    expect(getMarketLabsSnapshot).toHaveBeenCalledWith({
      includeUnlisted: false,
      cursor: 0,
      limit: 100,
    })
    expect(getMarketLabsSnapshot).toHaveBeenCalledWith({
      includeUnlisted: false,
      cursor: 100,
      limit: 100,
    })
    expect(result).toMatchObject({
      labs: [expect.objectContaining({ id: 101, name: 'Quantum simulation' })],
      totalLabs: 2,
      returnedLabs: 1,
      cursor: 0,
      nextCursor: '1',
      facets: {
        categories: ['Engineering', 'Physics'],
        providers: ['Provider B', 'Provider C', 'Provider D'],
      },
    })
  })

  test('propagates a stale source snapshot instead of pretending filtered results are fresh', async () => {
    getMarketLabsSnapshot.mockResolvedValue(snapshot({
      cursor: 0,
      totalLabs: 1,
      catalogueStatus: 'stale',
      labs: [lab(1)],
    }))

    const result = await getMarketCatalogueSnapshot({ includeUnlisted: false, cursor: 0, limit: 24 })

    expect(result.catalogueStatus).toBe('stale')
  })

  test('does not return a partial filtered catalogue when a source page is unavailable', async () => {
    getMarketLabsSnapshot
      .mockResolvedValueOnce(snapshot({ cursor: 0, totalLabs: 101, labs: [lab(1)] }))
      .mockResolvedValueOnce(snapshot({
        cursor: 100,
        totalLabs: 101,
        labs: [],
        catalogueStatus: 'unavailable',
      }))

    const result = await getMarketCatalogueSnapshot({ includeUnlisted: false, cursor: 0, limit: 24 })

    expect(result).toMatchObject({
      catalogueStatus: 'unavailable',
      errorCode: 'MARKET_CATALOGUE_UNAVAILABLE',
      labs: [],
    })
  })

  test('loads independent source pages with bounded parallelism', async () => {
    const page100 = deferred()
    const page200 = deferred()

    getMarketLabsSnapshot.mockImplementation(({ cursor }) => {
      if (cursor === 0) {
        return Promise.resolve(snapshot({ cursor: 0, totalLabs: 301, labs: [lab(1)] }))
      }
      if (cursor === 100) return page100.promise
      if (cursor === 200) return page200.promise
      if (cursor === 300) {
        return Promise.resolve(snapshot({ cursor: 300, totalLabs: 301, labs: [lab(301)] }))
      }
      throw new Error(`Unexpected source cursor ${cursor}`)
    })

    const resultPromise = getMarketCatalogueSnapshot({ includeUnlisted: false, cursor: 0, limit: 24 })
    await Promise.resolve()
    await Promise.resolve()

    expect(getMarketLabsSnapshot).toHaveBeenCalledWith({
      includeUnlisted: false,
      cursor: 100,
      limit: 100,
    })
    expect(getMarketLabsSnapshot).toHaveBeenCalledWith({
      includeUnlisted: false,
      cursor: 200,
      limit: 100,
    })
    expect(getMarketLabsSnapshot).not.toHaveBeenCalledWith({
      includeUnlisted: false,
      cursor: 300,
      limit: 100,
    })

    page100.resolve(snapshot({ cursor: 100, totalLabs: 301, labs: [lab(101)] }))
    await Promise.resolve()
    await Promise.resolve()

    expect(getMarketLabsSnapshot).toHaveBeenCalledWith({
      includeUnlisted: false,
      cursor: 300,
      limit: 100,
    })

    page200.resolve(snapshot({ cursor: 200, totalLabs: 301, labs: [lab(201)] }))

    await expect(resultPromise).resolves.toMatchObject({
      totalLabs: 4,
      returnedLabs: 4,
      nextCursor: null,
    })
  })
})
