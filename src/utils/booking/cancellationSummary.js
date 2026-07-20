import { formatRawCredits } from '@/utils/blockchain/creditUnits'

const CANCELLATION_FEE_PERCENT = 5n
const CANCELLATION_FEE_DENOMINATOR = 100n
const PROVIDER_FEE_PERCENT_OF_TOTAL = 3n
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
  const preview = getCancellationPreview(booking)
  return preview ? preview.refundRaw : null
}

const toTimestamp = (value) => {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

const normalizeAllocations = (allocations) => (
  Array.isArray(allocations) ? allocations : []
)

const buildPreview = ({
  source,
  status,
  price,
  totalFee,
  providerFee,
  refund,
  cutoff,
  periodStart = null,
  periodEnd = null,
  sourceCreditExpiry = null,
  allocations = [],
  policyVersion = 1,
  cancellable = status === 1,
}) => {
  const percentageFee = (price * CANCELLATION_FEE_PERCENT) / CANCELLATION_FEE_DENOMINATOR
  const minimumFee = price < MIN_CANCELLATION_FEE ? price : MIN_CANCELLATION_FEE

  return {
    source,
    status,
    cancellable,
    priceRaw: price,
    percentageFeeRaw: percentageFee,
    minimumFeeRaw: minimumFee,
    totalFeeRaw: totalFee,
    providerFeeRaw: providerFee,
    refundRaw: refund,
    minimumFeeApplied: totalFee > percentageFee,
    cancellationCutoff: toTimestamp(cutoff),
    spendingPeriodStart: toTimestamp(periodStart),
    spendingPeriodEnd: toTimestamp(periodEnd),
    sourceCreditExpiry: toTimestamp(sourceCreditExpiry),
    allocations: normalizeAllocations(allocations),
    policyVersion: Number(policyVersion) || 1,
  }
}

/**
 * Normalizes the contract's cancellation preview for the confirmation UI.
 * Legacy deployments fall back to the same LibRevenue constants, but are
 * explicitly marked so the UI does not present a local estimate as on-chain
 * source-lot accounting.
 */
export function getCancellationPreview(booking) {
  const status = Number(booking?.status)
  const bookingPrice = parseRawCreditAmount(booking?.price)
  const onChain = booking?.cancellationPreview

  if (onChain && bookingPrice !== null) {
    const price = parseRawCreditAmount(onChain.price) ?? bookingPrice
    const refund = parseRawCreditAmount(onChain.refundAmount)
    const totalFee = parseRawCreditAmount(onChain.totalFee)
    const providerFee = parseRawCreditAmount(onChain.providerFee)

    if (refund !== null && totalFee !== null && providerFee !== null) {
      return buildPreview({
        source: 'on-chain',
        status: Number(onChain.status ?? status),
        cancellable: Boolean(onChain.cancellable),
        price,
        totalFee,
        providerFee,
        refund,
        cutoff: onChain.cancellationCutoff ?? booking?.start,
        periodStart: onChain.spendingPeriodStart,
        periodEnd: onChain.spendingPeriodEnd,
        sourceCreditExpiry: onChain.sourceCreditExpiry,
        allocations: onChain.allocations,
        policyVersion: onChain.policyVersion,
      })
    }
  }

  // A pending request has not consumed credits and has no cancellation fee.
  if (status === 0) {
    return buildPreview({
      source: 'local-fallback',
      status,
      price: bookingPrice ?? 0n,
      totalFee: 0n,
      providerFee: 0n,
      refund: 0n,
      cutoff: booking?.start,
      cancellable: false,
    })
  }

  if (status !== 1 || bookingPrice === null) return null

  const percentageFee = (bookingPrice * CANCELLATION_FEE_PERCENT) / CANCELLATION_FEE_DENOMINATOR
  const minimumFee = bookingPrice < MIN_CANCELLATION_FEE ? bookingPrice : MIN_CANCELLATION_FEE
  const totalFee = percentageFee < minimumFee ? minimumFee : percentageFee
  const providerFee = (totalFee * PROVIDER_FEE_PERCENT_OF_TOTAL) / CANCELLATION_FEE_PERCENT

  return buildPreview({
    source: 'local-fallback',
    status,
    price: bookingPrice,
    totalFee,
    providerFee,
    refund: bookingPrice - totalFee,
    cutoff: booking?.start,
  })
}

export function getCancellationCreditReturnLabel(booking) {
  const amount = calculateCancellationCreditReturn(booking)
  return amount === null ? 'Unavailable until reservation details load' : `${formatRawCredits(amount)} credits`
}
