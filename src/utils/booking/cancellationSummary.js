import { formatRawCredits } from '@/utils/blockchain/creditUnits'

const CANCELLATION_FEE_PERCENT = 5n
const CANCELLATION_FEE_DENOMINATOR = 100n
const MIN_CANCELLATION_FEE = 10_000n

const parseRawCreditAmount = (value) => {
  if (typeof value === 'bigint') return value >= 0n ? value : null
  if (typeof value !== 'string' && typeof value !== 'number') return null

  const normalized = String(value).trim()
  if (!/^\d+$/.test(normalized)) return null

  try {
    return BigInt(normalized)
  } catch {
    return null
  }
}

/**
 * Mirrors LibRevenue.computeCancellationFee for the confirmation UI. The
 * cancellation intent still reads the current reservation from the contract
 * and remains the authoritative decision point.
 */
export function calculateCancellationCreditReturn(booking) {
  const status = Number(booking?.status)

  // A pending reservation request has not charged institutional credits.
  if (status === 0) return 0n
  if (status !== 1) return null

  const price = parseRawCreditAmount(booking?.price)
  if (price === null) return null
  if (price === 0n) return 0n

  const percentageFee = (price * CANCELLATION_FEE_PERCENT) / CANCELLATION_FEE_DENOMINATOR
  const minimumFee = price < MIN_CANCELLATION_FEE ? price : MIN_CANCELLATION_FEE
  const totalFee = percentageFee < minimumFee ? minimumFee : percentageFee
  return price - totalFee
}

export function getCancellationCreditReturnLabel(booking) {
  const amount = calculateCancellationCreditReturn(booking)
  return amount === null ? 'Unavailable until reservation details load' : `${formatRawCredits(amount)} credits`
}
