import { formatUnits, parseUnits } from 'viem'

export const CREDIT_DECIMALS = 5
export const RAW_PER_CREDIT = 10n ** BigInt(CREDIT_DECIMALS)
export const CREDITS_PER_EUR = 10
export const RAW_PER_EUR = RAW_PER_CREDIT * BigInt(CREDITS_PER_EUR)
export const SECONDS_PER_HOUR = 3600n
export const DISPLAY_PRICE_DECIMALS = 1

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

export function roundDecimalString(value, maxFractionDigits = DISPLAY_PRICE_DECIMALS) {
  if (value === null || value === undefined) return '0'

  const text = String(value).trim()
  if (!text) return '0'

  const negative = text.startsWith('-')
  const unsigned = negative ? text.slice(1) : text
  if (!/^\d+(?:\.\d+)?$/.test(unsigned)) {
    return '0'
  }

  const safeDigits = Math.max(0, Number(maxFractionDigits) || 0)
  const [integerPartRaw, fractionPartRaw = ''] = unsigned.split('.')
  const integerPart = integerPartRaw || '0'

  if (safeDigits === 0) {
    let roundedInteger = BigInt(integerPart)
    if ((fractionPartRaw[0] || '0') >= '5') {
      roundedInteger += 1n
    }
    const normalized = roundedInteger.toString()
    return negative && normalized !== '0' ? `-${normalized}` : normalized
  }

  const paddedFraction = fractionPartRaw.padEnd(safeDigits + 1, '0')
  const keptFraction = paddedFraction.slice(0, safeDigits)
  const roundingDigit = paddedFraction[safeDigits] || '0'
  const scale = 10n ** BigInt(safeDigits)

  let scaledValue = BigInt(integerPart) * scale + BigInt(keptFraction || '0')
  if (roundingDigit >= '5') {
    scaledValue += 1n
  }

  const roundedInteger = scaledValue / scale
  const roundedFraction = (scaledValue % scale).toString().padStart(safeDigits, '0')
  const normalized = trimTrailingZeros(`${roundedInteger.toString()}.${roundedFraction}`)
  return negative && normalized !== '0' ? `-${normalized}` : normalized
}

export function formatRawPricePerHour(rawPricePerSecond, decimals = CREDIT_DECIMALS) {
  try {
    const normalized = typeof rawPricePerSecond === 'bigint'
      ? rawPricePerSecond
      : BigInt(rawPricePerSecond ?? 0)
    const hourlyCredits = formatUnits(normalized * SECONDS_PER_HOUR, decimals)
    return roundDecimalString(hourlyCredits, DISPLAY_PRICE_DECIMALS)
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
