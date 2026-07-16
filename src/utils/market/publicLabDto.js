const MAX_PUBLIC_TEXT_LENGTH = 200
const MAX_PUBLIC_IMAGE_LENGTH = 4096
const WALLET_LABEL_PATTERN = /^0x[a-f0-9]{1,64}(?:\.\.\.[a-f0-9]{1,64})?$/i
const PUBLIC_PRICE_UNITS = new Set(['minute', 'hour', 'day', 'week', 'month'])

const normalizeText = (value, fallback = '') => {
  if (typeof value !== 'string' && typeof value !== 'number') return fallback
  return String(value).trim().slice(0, MAX_PUBLIC_TEXT_LENGTH)
}

const normalizeId = (value) => {
  const numeric = Number(value)
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : null
}

const normalizeCategories = (value) => {
  const values = Array.isArray(value) ? value : [value]
  return [...new Set(values
    .map((item) => normalizeText(item))
    .filter(Boolean))]
}

const normalizeKeywords = (value) => [...new Set((Array.isArray(value) ? value : [value])
  .map((item) => normalizeText(item))
  .filter(Boolean))].slice(0, 32)

const normalizePriceUnit = (lab) => {
  const candidate = lab?.priceUnit
    || lab?.pricing?.displayUnit
    || lab?.pricing?.unit
    || 'hour'
  const unit = String(candidate).trim().toLowerCase()
  return PUBLIC_PRICE_UNITS.has(unit) ? unit : 'hour'
}

const normalizeRating = (reputation) => {
  if (!reputation || typeof reputation !== 'object') return null
  const score = Number(reputation.score)
  const totalEvents = Number(reputation.totalEvents)
  if (!Number.isFinite(score) || !Number.isFinite(totalEvents) || totalEvents <= 0) return null
  return {
    score,
    totalEvents,
  }
}

/**
 * Accept only browser-safe image references in the public catalogue.
 * Credentials, metadata paths and active URL schemes never belong here.
 */
export const sanitizePublicImage = (value) => {
  if (typeof value !== 'string') return ''
  const image = value.trim()
  if (!image || image.length > MAX_PUBLIC_IMAGE_LENGTH) return ''
  if (image.startsWith('/') && !image.startsWith('//')) return image

  try {
    const parsed = new URL(image)
    return parsed.protocol === 'https:' ? parsed.toString() : ''
  } catch {
    return ''
  }
}

const resolvePublicProvider = (lab) => {
  const providerName = normalizeText(lab?.providerInfo?.name || lab?.provider)
  if (!providerName || WALLET_LABEL_PATTERN.test(providerName)) return 'Unknown Provider'
  return providerName
}

/**
 * DTO crossing the public server-to-browser catalogue boundary.
 * Keep this allowlist explicit: adding a field here is an intentional public
 * disclosure decision.
 */
export const toPublicMarketLab = (lab) => {
  const id = normalizeId(lab?.id ?? lab?.labId ?? lab?.tokenId)
  if (id === null) return null

  const image = sanitizePublicImage(lab?.image || lab?.images?.[0] || lab?.imageUrls?.[0])
  const publicLab = {
    id,
    name: normalizeText(lab?.name, `Lab ${id}`) || `Lab ${id}`,
    description: normalizeText(lab?.description),
    provider: resolvePublicProvider(lab),
    image,
    price: typeof lab?.price === 'string' || typeof lab?.price === 'number'
      ? String(lab.price)
      : '0',
    priceUnit: normalizePriceUnit(lab),
    category: normalizeCategories(lab?.category),
    keywords: normalizeKeywords(lab?.keywords),
    rating: normalizeRating(lab?.reputation || lab?.rating),
    resourceType: typeof lab?.resourceType === 'number' || typeof lab?.resourceType === 'string'
      ? lab.resourceType
      : 0,
    isListed: Boolean(lab?.isListed),
    demoEnabled: lab?.demoEnabled === true,
  }

  return publicLab
}

export const PUBLIC_MARKET_LAB_FIELDS = Object.freeze([
  'id',
  'name',
  'description',
  'provider',
  'image',
  'price',
  'priceUnit',
  'category',
  'keywords',
  'rating',
  'resourceType',
  'isListed',
  'demoEnabled',
])
