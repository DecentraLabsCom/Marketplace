import {
  DEFAULT_MARKET_PAGE_SIZE,
  getNextMarketCursor,
  parseMarketPageParams,
} from '../marketPagination'

describe('market pagination', () => {
  test('uses a bounded default page', () => {
    expect(parseMarketPageParams()).toEqual({
      cursor: 0,
      limit: DEFAULT_MARKET_PAGE_SIZE,
    })
  })

  test('normalizes numeric query values and caps the page size', () => {
    expect(parseMarketPageParams({ cursor: '48', limit: '500' })).toEqual({
      cursor: 48,
      limit: 100,
    })
  })

  test('rejects malformed or zero-sized pages', () => {
    expect(() => parseMarketPageParams({ cursor: 'abc' })).toThrow()
    expect(() => parseMarketPageParams({ limit: '0' })).toThrow()
  })

  test('returns the next source cursor only while more source records exist', () => {
    expect(getNextMarketCursor({ cursor: 0, sourceCount: 24, total: 60 })).toBe('24')
    expect(getNextMarketCursor({ cursor: 24, sourceCount: 24, total: 48 })).toBeNull()
    expect(getNextMarketCursor({ cursor: 0, sourceCount: 0, total: 60 })).toBeNull()
  })
})
