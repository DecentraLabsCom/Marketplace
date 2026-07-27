import {
  filterMarketLabs,
  parseMarketCatalogueFilters,
} from '../marketCatalogueFilters'

const lab = (id, overrides = {}) => ({
  id,
  name: `Lab ${id}`,
  provider: 'Provider A',
  category: ['Engineering'],
  keywords: [],
  description: '',
  price: '100',
  createdAt: 1_700_000_000,
  resourceType: 0,
  isListed: true,
  reputation: null,
  ...overrides,
})

describe('market catalogue sorting', () => {
  test('accepts the supported sort criteria', () => {
    expect(parseMarketCatalogueFilters(new URLSearchParams('sort=rating_desc'))).toEqual({
      sort: 'rating_desc',
    })
    expect(parseMarketCatalogueFilters(new URLSearchParams('sort=age_oldest'))).toEqual({
      sort: 'age_oldest',
    })
    expect(parseMarketCatalogueFilters(new URLSearchParams('listing=unlisted'))).toEqual({
      listing: 'unlisted',
    })
  })

  test('filters listed and unlisted labs explicitly', () => {
    const labs = [
      lab(1, { isListed: true }),
      lab(2, { isListed: false }),
    ]

    expect(filterMarketLabs(labs, { listing: 'listed' }).map(({ id }) => id)).toEqual([1])
    expect(filterMarketLabs(labs, { listing: 'all' }).map(({ id }) => id)).toEqual([1, 2])
    expect(filterMarketLabs(labs, { listing: 'unlisted' }).map(({ id }) => id)).toEqual([2])
  })

  test('sorts by rating with unrated labs at the end', () => {
    const labs = [
      lab(1, { reputation: { score: 4.2, totalEvents: 3 } }),
      lab(2, { reputation: null }),
      lab(3, { reputation: { score: 4.8, totalEvents: 5 } }),
    ]

    expect(filterMarketLabs(labs, { sort: 'rating_desc' }).map(({ id }) => id)).toEqual([3, 1, 2])
    expect(filterMarketLabs(labs, { sort: 'rating_asc' }).map(({ id }) => id)).toEqual([1, 3, 2])
  })

  test('sorts by lab age and name', () => {
    const labs = [
      lab(1, { name: 'Zeta Lab', createdAt: 1_600_000_000 }),
      lab(2, { name: 'Alpha Lab', createdAt: 1_800_000_000 }),
      lab(3, { name: 'Beta Lab', createdAt: 1_700_000_000 }),
    ]

    expect(filterMarketLabs(labs, { sort: 'age_newest' }).map(({ id }) => id)).toEqual([2, 3, 1])
    expect(filterMarketLabs(labs, { sort: 'age_oldest' }).map(({ id }) => id)).toEqual([1, 3, 2])
    expect(filterMarketLabs(labs, { sort: 'name_asc' }).map(({ id }) => id)).toEqual([2, 3, 1])
  })
})
