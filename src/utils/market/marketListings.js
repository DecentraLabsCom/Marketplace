export const MARKET_LISTING_OPTIONS = Object.freeze([
  { value: 'listed', label: 'Listed' },
  { value: 'all', label: 'All' },
  { value: 'unlisted', label: 'Unlisted' },
])

export const MARKET_LISTING_VALUES = Object.freeze(
  MARKET_LISTING_OPTIONS.map(({ value }) => value),
)
