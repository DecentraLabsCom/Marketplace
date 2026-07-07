import { normalizePricingUnit } from '@/utils/pricing/pricingUnits'

export const PRICE_UNIT_OPTIONS = [
  { value: 'hour', label: 'hour' },
  { value: 'day', label: 'day' },
  { value: 'week', label: 'week' },
  { value: 'month', label: '30-day month' },
]

export const PERIOD_UNIT_OPTIONS = [
  { value: 'day', label: 'days' },
  { value: 'week', label: 'weeks' },
  { value: 'month', label: '30-day months' },
]

export const normalizePeriodUnit = (unit, fallback = 'day') => {
  const normalized = String(unit || fallback).trim().toLowerCase().replace(/s$/, '')
  return PERIOD_UNIT_OPTIONS.some(option => option.value === normalized) ? normalized : fallback
}

export const periodUnitOptionsForPriceUnit = (priceUnit) => {
  const normalizedPriceUnit = normalizePricingUnit(priceUnit)
  const minimum = normalizedPriceUnit === 'month'
    ? 'month'
    : normalizedPriceUnit === 'week'
      ? 'week'
      : 'day'
  const index = PERIOD_UNIT_OPTIONS.findIndex(option => option.value === minimum)
  return PERIOD_UNIT_OPTIONS.slice(Math.max(0, index))
}

export const normalizeAllowedDurationRange = (range = {}, priceUnit = 'day') => {
  const availableUnits = periodUnitOptionsForPriceUnit(priceUnit)
  const fallbackUnit = availableUnits[0]?.value || 'day'
  const unit = availableUnits.some(option => option.value === range?.unit)
    ? normalizePeriodUnit(range.unit, fallbackUnit)
    : fallbackUnit
  const maxByUnit = { day: 90, week: 12, month: 3 }
  const unitMax = maxByUnit[unit] || 90
  const rawMin = Math.trunc(Number(range?.min ?? 1))
  const rawMax = Math.trunc(Number(range?.max ?? rawMin))
  const min = Math.min(Math.max(Number.isFinite(rawMin) ? rawMin : 1, 1), unitMax)
  const max = Math.min(Math.max(Number.isFinite(rawMax) ? rawMax : min, min), unitMax)
  return { unit, min, max }
}
