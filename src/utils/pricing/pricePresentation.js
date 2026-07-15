import { normalizePricingUnit } from './pricingUnits'

const isZeroPrice = (price) => {
  if (typeof price === 'bigint') return price === 0n
  if (typeof price === 'number') return Number.isFinite(price) && price === 0

  const text = String(price ?? '').trim()
  if (!text) return false

  if (/^[+-]?\d+$/.test(text)) {
    try {
      return BigInt(text) === 0n
    } catch {
      return false
    }
  }

  const numeric = Number(text)
  return Number.isFinite(numeric) && numeric === 0
}

export const getLabPricingUnit = (labOrUnit) => {
  if (typeof labOrUnit === 'string') {
    return normalizePricingUnit(labOrUnit)
  }

  return normalizePricingUnit(
    labOrUnit?.priceUnit
      || labOrUnit?.pricing?.displayUnit
      || labOrUnit?.pricing?.unit
      || 'hour'
  )
}

/**
 * Format the public-facing unit price in one place.
 * `price` is the on-chain raw-per-second price used by formatPrice.
 */
export const formatPricePerUnit = ({ price, lab, unit, formatPrice }) => {
  const normalizedUnit = getLabPricingUnit(unit || lab)

  if (isZeroPrice(price)) {
    return {
      amount: 'Free',
      unit: normalizedUnit,
      isFree: true,
      text: 'Free',
    }
  }

  const amount = typeof formatPrice === 'function'
    ? formatPrice(price, normalizedUnit)
    : '0'

  return {
    amount,
    unit: normalizedUnit,
    isFree: false,
    text: `${amount} credits / ${normalizedUnit}`,
  }
}

