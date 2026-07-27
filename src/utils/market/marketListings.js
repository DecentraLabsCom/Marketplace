export const MARKET_LISTING_OPTIONS = Object.freeze([
  { value: 'listed', label: 'Listed' },
  { value: 'unlisted', label: 'Unlisted' },
  { value: 'all', label: 'All' },
])

export const MARKET_LISTING_VALUES = Object.freeze(
  MARKET_LISTING_OPTIONS.map(({ value }) => value),
)
