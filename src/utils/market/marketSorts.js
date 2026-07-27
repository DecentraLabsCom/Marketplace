export const MARKET_SORT_OPTIONS = Object.freeze([
  { value: 'relevance', label: 'Relevance' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'rating_desc', label: 'Rating: highest first' },
  { value: 'rating_asc', label: 'Rating: lowest first' },
  { value: 'age_newest', label: 'Lab age: newest first' },
  { value: 'age_oldest', label: 'Lab age: oldest first' },
  { value: 'name_asc', label: 'Name: A–Z' },
  { value: 'name_desc', label: 'Name: Z–A' },
])

export const MARKET_SORT_VALUES = Object.freeze(
  MARKET_SORT_OPTIONS.map(({ value }) => value),
)
