import { getResourceType, RESOURCE_TYPES } from '@/utils/resourceType'

const MAX_FILTER_TEXT_LENGTH = 200
const MAX_SEARCH_LENGTH = 120
const SEARCH_FIELDS = new Set(['keyword', 'name'])
const RESOURCE_TYPES_FILTER = new Set([RESOURCE_TYPES.LAB, RESOURCE_TYPES.FMU])
const SORTS = new Set(['price_asc', 'price_desc'])

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

  if (!filters.sort) return filtered

  const direction = filters.sort === 'price_desc' ? -1 : 1
  return [...filtered].sort((left, right) => {
    const leftPrice = priceAsBigInt(left?.price)
    const rightPrice = priceAsBigInt(right?.price)
    if (leftPrice === rightPrice) return Number(left?.id) - Number(right?.id)
    return leftPrice > rightPrice ? direction : -direction
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
