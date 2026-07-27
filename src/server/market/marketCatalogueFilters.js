import { getResourceType, RESOURCE_TYPES } from '@/utils/resourceType'
import { MARKET_SORT_VALUES } from '@/utils/market/marketSorts'

const MAX_FILTER_TEXT_LENGTH = 200
const MAX_SEARCH_LENGTH = 120
const SEARCH_FIELDS = new Set(['keyword', 'name'])
const RESOURCE_TYPES_FILTER = new Set([RESOURCE_TYPES.LAB, RESOURCE_TYPES.FMU])
const SORTS = new Set(MARKET_SORT_VALUES)

const normalizeText = (value, { maxLength = MAX_FILTER_TEXT_LENGTH } = {}) => {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') throw new Error('Invalid market filter parameter')
  const normalized = value.trim().normalize('NFKC')
  const hasControlCharacter = [...normalized].some((character) => {
    const code = character.codePointAt(0)
    return code !== undefined && (code < 32 || code === 127)
  })
  if (!normalized || normalized.length > maxLength || hasControlCharacter) {
    throw new Error('Invalid market filter parameter')
  }
  return normalized
}

const normalizeEnum = (value, allowed) => {
  const normalized = normalizeText(value, { maxLength: 32 })
  if (normalized === undefined) return undefined
  if (!allowed.has(normalized)) throw new Error('Invalid market filter parameter')
  return normalized
}

const fold = (value) => String(value || '').normalize('NFKC').toLocaleLowerCase()

export function parseMarketCatalogueFilters(searchParams) {
  const read = (key) => searchParams?.get?.(key)
  const q = normalizeText(read('q'), { maxLength: MAX_SEARCH_LENGTH })
  const searchField = normalizeEnum(read('searchField'), SEARCH_FIELDS)
  const category = normalizeText(read('category'))
  const provider = normalizeText(read('provider'))
  const resourceType = normalizeEnum(read('resourceType'), RESOURCE_TYPES_FILTER)
  const sort = normalizeEnum(read('sort'), SORTS)

  return {
    ...(q ? { q } : {}),
    ...(searchField ? { searchField } : {}),
    ...(category ? { category } : {}),
    ...(provider ? { provider } : {}),
    ...(resourceType ? { resourceType } : {}),
    ...(sort ? { sort } : {}),
  }
}

const priceAsBigInt = (value) => {
  try {
    return /^\d+$/.test(String(value ?? '')) ? BigInt(value) : 0n
  } catch {
    return 0n
  }
}

const finiteNumberOrNull = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const ratingAsNumber = (lab) => finiteNumberOrNull(lab?.reputation?.score ?? lab?.rating?.score)

const createdAtAsNumber = (lab) => finiteNumberOrNull(lab?.createdAt)

const compareNullableNumbers = (left, right, direction) => {
  if (left === null && right === null) return 0
  if (left === null) return 1
  if (right === null) return -1
  if (left === right) return 0
  return left > right ? direction : -direction
}

const compareText = (left, right) => {
  const leftText = fold(left)
  const rightText = fold(right)
  if (leftText === rightText) return 0
  return leftText > rightText ? 1 : -1
}

const compareIds = (left, right) => {
  const leftId = finiteNumberOrNull(left?.id)
  const rightId = finiteNumberOrNull(right?.id)
  if (leftId === null || rightId === null || leftId === rightId) return 0
  return leftId > rightId ? 1 : -1
}

const matchesSearch = (lab, query, searchField) => {
  if (!query) return true
  const normalizedQuery = fold(query)
  const names = [lab?.name]
  if (searchField === 'name') {
    return names.some((value) => fold(value).includes(normalizedQuery))
  }

  const searchableFields = [
    ...names,
    lab?.provider,
    lab?.description,
    ...(Array.isArray(lab?.category) ? lab.category : [lab?.category]),
    ...(Array.isArray(lab?.keywords) ? lab.keywords : [lab?.keywords]),
  ]
  return searchableFields.some((value) => fold(value).includes(normalizedQuery))
}

export function filterMarketLabs(labs, filters = {}) {
  const source = Array.isArray(labs) ? labs : []
  const filtered = source.filter((lab) => {
    if (!matchesSearch(lab, filters.q, filters.searchField)) return false
    if (
      filters.category
      && !(Array.isArray(lab?.category) ? lab.category : [lab?.category])
        .some((category) => fold(category) === fold(filters.category))
    ) return false
    if (filters.provider && fold(lab?.provider) !== fold(filters.provider)) return false
    if (filters.resourceType && getResourceType(lab) !== filters.resourceType) return false
    return true
  })

  if (!filters.sort || filters.sort === 'relevance') return filtered

  return [...filtered].sort((left, right) => {
    if (filters.sort === 'price_asc' || filters.sort === 'price_desc') {
      const leftPrice = priceAsBigInt(left?.price)
      const rightPrice = priceAsBigInt(right?.price)
      if (leftPrice !== rightPrice) {
        const direction = filters.sort === 'price_desc' ? -1 : 1
        return leftPrice > rightPrice ? direction : -direction
      }
    } else if (filters.sort === 'rating_asc' || filters.sort === 'rating_desc') {
      const direction = filters.sort === 'rating_desc' ? -1 : 1
      const comparison = compareNullableNumbers(ratingAsNumber(left), ratingAsNumber(right), direction)
      if (comparison !== 0) return comparison
    } else if (filters.sort === 'age_newest' || filters.sort === 'age_oldest') {
      const direction = filters.sort === 'age_newest' ? -1 : 1
      const comparison = compareNullableNumbers(createdAtAsNumber(left), createdAtAsNumber(right), direction)
      if (comparison !== 0) return comparison
    } else if (filters.sort === 'name_asc' || filters.sort === 'name_desc') {
      const direction = filters.sort === 'name_desc' ? -1 : 1
      const comparison = compareText(left?.name, right?.name) * direction
      if (comparison !== 0) return comparison
    }

    return compareIds(left, right)
  })
}

export function buildMarketFacets(labs) {
  const categories = new Set()
  const providers = new Set()

  ;(Array.isArray(labs) ? labs : []).forEach((lab) => {
    ;(Array.isArray(lab?.category) ? lab.category : [lab?.category]).forEach((category) => {
      if (typeof category === 'string' && category.trim()) categories.add(category.trim())
    })
    if (typeof lab?.provider === 'string' && lab.provider.trim()) providers.add(lab.provider.trim())
  })

  return {
    categories: [...categories].sort((left, right) => left.localeCompare(right)),
    providers: [...providers].sort((left, right) => left.localeCompare(right)),
  }
}

export function paginateMarketLabs(labs, { cursor = 0, limit = 24 } = {}) {
  const source = Array.isArray(labs) ? labs : []
  const page = source.slice(cursor, cursor + limit)
  const nextOffset = cursor + page.length
  return {
    labs: page,
    totalLabs: source.length,
    returnedLabs: page.length,
    cursor,
    limit,
    nextCursor: nextOffset < source.length ? String(nextOffset) : null,
  }
}
