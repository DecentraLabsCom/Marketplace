import { formatUnits, parseUnits } from 'viem'
import {
  CREDIT_DECIMALS,
  RAW_PER_CREDIT,
  roundDecimalString,
  trimTrailingZeros,
} from '@/utils/blockchain/creditUnits'

export const PRICING_UNITS = Object.freeze({
  minute: 60n,
  hour: 3600n,
  day: 86400n,
  week: 604800n,
  month: 2592000n,
})

export const DEFAULT_BOOKING_MODE = 'slot'
export const CALENDAR_PERIOD_BOOKING_MODE = 'calendar-period'

export function normalizePricingUnit(unit, fallback = 'hour') {
  const normalized = String(unit || fallback).trim().toLowerCase()
  return Object.prototype.hasOwnProperty.call(PRICING_UNITS, normalized)
    ? normalized
    : fallback
}

export function parseDisplayCredits(value, decimals = CREDIT_DECIMALS) {
  const text = String(value ?? '').trim()
  if (!text) {
    throw new Error('Price is required')
  }
  const raw = parseUnits(text, decimals)
  if (raw < 0n) {
    throw new Error('Price must be positive')
  }
  return raw
}

export function displayPriceToRawPerSecond(amount, unit = 'hour', decimals = CREDIT_DECIMALS) {
  const rawDisplayAmount = parseDisplayCredits(amount, decimals)
  const seconds = PRICING_UNITS[normalizePricingUnit(unit)]
  if (rawDisplayAmount === 0n) return 0n
  return (rawDisplayAmount + seconds - 1n) / seconds
}

export function rawPerSecondToDisplayPrice(rawPerSecond, unit = 'hour', {
  decimals = CREDIT_DECIMALS,
  maxFractionDigits = 1,
} = {}) {
  try {
    const normalizedRaw = typeof rawPerSecond === 'bigint'
      ? rawPerSecond
      : BigInt(rawPerSecond ?? 0)
    const seconds = PRICING_UNITS[normalizePricingUnit(unit)]
    const displayCredits = formatUnits(normalizedRaw * seconds, decimals)
    return roundDecimalString(displayCredits, maxFractionDigits)
  } catch {
    return '0'
  }
}

export function calculateReservationTotal(rawPerSecond, startUnix, endUnix) {
  const pricePerSecond = typeof rawPerSecond === 'bigint' ? rawPerSecond : BigInt(rawPerSecond ?? 0)
  const start = typeof startUnix === 'bigint' ? startUnix : BigInt(startUnix ?? 0)
  const end = typeof endUnix === 'bigint' ? endUnix : BigInt(endUnix ?? 0)
  if (pricePerSecond < 0n || end <= start) return 0n
  return pricePerSecond * (end - start)
}

export function normalizeBookingMode(metadata = {}) {
  const rawMode = metadata?.bookingMode
    || metadata?.attributes?.find?.((attr) => String(attr?.trait_type).toLowerCase() === 'bookingmode')?.value
  const mode = String(rawMode || '').trim().toLowerCase()
  if (mode === CALENDAR_PERIOD_BOOKING_MODE || mode === 'calendar_period' || mode === 'period') {
    return CALENDAR_PERIOD_BOOKING_MODE
  }
  return DEFAULT_BOOKING_MODE
}

export function normalizeAllowedDurations(metadata = {}) {
  const explicit = metadata?.allowedDurations
  if (Array.isArray(explicit) && explicit.length > 0) {
    return explicit
      .map((duration) => ({
        unit: normalizePricingUnit(duration?.unit, 'minute'),
        value: Number(duration?.value),
      }))
      .filter((duration) => Number.isFinite(duration.value) && duration.value > 0)
  }

  const timeSlots = metadata?.timeSlots
  if (Array.isArray(timeSlots) && timeSlots.length > 0) {
    return timeSlots
      .map((slot) => ({ unit: 'minute', value: Number(slot) }))
      .filter((duration) => Number.isFinite(duration.value) && duration.value > 0)
  }

  return []
}

export function formatRawCreditsForUnit(rawPerSecond, unit = 'hour') {
  return trimTrailingZeros(rawPerSecondToDisplayPrice(rawPerSecond, unit))
}

export function effectiveDisplayCredits(amount, unit = 'hour', decimals = CREDIT_DECIMALS) {
  const rawPerSecond = displayPriceToRawPerSecond(amount, unit, decimals)
  return {
    rawPerSecond,
    effectiveAmount: rawPerSecondToDisplayPrice(rawPerSecond, unit, { decimals, maxFractionDigits: 5 }),
    rawDisplayAmount: parseDisplayCredits(amount, decimals),
    rawPerCredit: RAW_PER_CREDIT,
  }
}
