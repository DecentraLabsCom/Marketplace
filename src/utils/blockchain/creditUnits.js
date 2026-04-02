import { formatUnits, parseUnits } from 'viem'

export const CREDIT_DECIMALS = 5
export const RAW_PER_CREDIT = 10n ** BigInt(CREDIT_DECIMALS)
export const CREDITS_PER_EUR = 10
export const RAW_PER_EUR = RAW_PER_CREDIT * BigInt(CREDITS_PER_EUR)
export const SECONDS_PER_HOUR = 3600n

export function trimTrailingZeros(value) {
  if (value === null || value === undefined) return '0'
  const text = String(value).trim()
  if (!text) return '0'
  if (!text.includes('.')) return text
  return text.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '').replace(/\.$/, '')
}

export function formatRawCredits(rawAmount, decimals = CREDIT_DECIMALS) {
  try {
    const normalized = typeof rawAmount === 'bigint' ? rawAmount : BigInt(rawAmount ?? 0)
    return trimTrailingZeros(formatUnits(normalized, decimals))
  } catch {
    return '0'
  }
}

export function formatRawPricePerHour(rawPricePerSecond, decimals = CREDIT_DECIMALS) {
  try {
    const normalized = typeof rawPricePerSecond === 'bigint'
      ? rawPricePerSecond
      : BigInt(rawPricePerSecond ?? 0)
    return formatRawCredits(normalized * SECONDS_PER_HOUR, decimals)
  } catch {
    return '0'
  }
}

export function convertHourlyCreditsToRawPerSecond(hourlyCredits, decimals = CREDIT_DECIMALS) {
  const text = String(hourlyCredits ?? '').trim()
  if (!text) {
    throw new Error('Price is required')
  }

  const rawPerHour = parseUnits(text, decimals)
  if (rawPerHour < 0n) {
    throw new Error('Price must be positive')
  }

  // Contract stores integer raw units per second. Round hourly input to the nearest
  // representable per-second value so users are not blocked by precision constraints.
  const base = rawPerHour / SECONDS_PER_HOUR
  const remainder = rawPerHour % SECONDS_PER_HOUR
  const shouldRoundUp = remainder * 2n >= SECONDS_PER_HOUR
  return shouldRoundUp ? base + 1n : base
}
