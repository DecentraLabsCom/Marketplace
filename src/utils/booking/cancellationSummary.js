import { formatRawCredits, RAW_PER_CREDIT } from '@/utils/blockchain/creditUnits'
import { isFmu } from '@/utils/resourceType'

const CANCELLATION_FEE_PERCENT = 10n
const CANCELLATION_FEE_DENOMINATOR = 100n
const PROVIDER_FEE_PERCENT_OF_TOTAL = 6n
const MIN_CANCELLATION_FEE = RAW_PER_CREDIT / 10n

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

const parseNonNegativeInteger = (value) => {
  if (typeof value === 'bigint') return value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null
  if (typeof value !== 'string' && typeof value !== 'number') return null

  const normalized = String(value).trim()
  if (!/^\d+$/.test(normalized)) return null

  const parsed = Number(normalized)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
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
  const parsed = parseNonNegativeInteger(value)
  return parsed !== null && parsed > 0 ? parsed : null
}

const normalizeAllocations = (allocations) => (
  Array.isArray(allocations) ? allocations : []
)

const normalizeAllocationCount = (value) => {
  return parseNonNegativeInteger(value)
}

const normalizePolicyVersion = (value) => {
  const parsed = parseNonNegativeInteger(value)
  return parsed !== null && parsed > 0 ? parsed : null
}

const isNonZeroAddress = (value) => (
  typeof value === 'string'
  && /^0x[\da-f]{40}$/i.test(value)
  && !/^0x0{40}$/i.test(value)
)

const normalizeSourceCreditExpiry = (value) => {
  const parsed = parseNonNegativeInteger(value)
  return {
    value: parsed !== null && parsed > 0 ? parsed : null,
    known: parsed !== null,
  }
}

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key)

const isCompleteOnChainPreview = (preview, status) => {
  if (!preview || !hasOwn(preview, 'status') || !hasOwn(preview, 'cancellable')) return false
  if (!Number.isInteger(Number(preview.status)) || Number(preview.status) !== status) return false
  if (typeof preview.cancellable !== 'boolean') return false
  if (!isNonZeroAddress(preview.refundDestination)) return false
  if (parseRawCreditAmount(preview.price) === null) return false
  if (parseRawCreditAmount(preview.refundAmount) === null) return false
  if (parseRawCreditAmount(preview.totalFee) === null) return false
  if (parseRawCreditAmount(preview.providerFee) === null) return false
  if (toTimestamp(preview.cancellationCutoff) === null) return false
  if (normalizeAllocationCount(preview.allocationCount) === null) return false
  if (normalizePolicyVersion(preview.policyVersion) === null) return false

  const expiry = normalizeSourceCreditExpiry(preview.sourceCreditExpiry)
  if (!hasOwn(preview, 'sourceCreditExpiry') || !expiry.known) return false

  // Confirmed reservations must expose the captured spending period in the
  // consent screen. Pending requests do not have a financial period yet.
  if (Number(preview.status) === 1 && (
    toTimestamp(preview.spendingPeriodStart) === null
    || toTimestamp(preview.spendingPeriodEnd) === null
  )) return false

  return true
}

const buildPreview = ({
  source,
  status,
  price,
  totalFee,
  providerFee,
  refund,
  refundDestination = null,
  cutoff,
  periodStart = null,
  periodEnd = null,
  sourceCreditExpiry = null,
  allocations = [],
  allocationCount = null,
  policyVersion = null,
  cancellable = status === 1,
}) => {
  const percentageFee = (price * CANCELLATION_FEE_PERCENT) / CANCELLATION_FEE_DENOMINATOR
  const minimumFee = price < MIN_CANCELLATION_FEE ? price : MIN_CANCELLATION_FEE
  const sourceExpiry = normalizeSourceCreditExpiry(sourceCreditExpiry)

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
    refundDestination,
    minimumFeeApplied: totalFee > percentageFee,
    cancellationCutoff: toTimestamp(cutoff),
    spendingPeriodStart: toTimestamp(periodStart),
    spendingPeriodEnd: toTimestamp(periodEnd),
    sourceCreditExpiry: sourceExpiry.value,
    sourceCreditExpiryKnown: sourceExpiry.known,
    allocations: normalizeAllocations(allocations),
    allocationCount: normalizeAllocationCount(allocationCount),
    policyVersion: normalizePolicyVersion(policyVersion),
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

  if (onChain && bookingPrice !== null && isCompleteOnChainPreview(onChain, status)) {
    const price = parseRawCreditAmount(onChain.price)
    const refund = parseRawCreditAmount(onChain.refundAmount)
    const totalFee = parseRawCreditAmount(onChain.totalFee)
    const providerFee = parseRawCreditAmount(onChain.providerFee)

    return buildPreview({
      source: 'on-chain',
      status: Number(onChain.status),
      cancellable: onChain.cancellable,
      price,
      totalFee,
      providerFee,
      refund,
      refundDestination: onChain.refundDestination,
      cutoff: onChain.cancellationCutoff,
      periodStart: onChain.spendingPeriodStart,
      periodEnd: onChain.spendingPeriodEnd,
      sourceCreditExpiry: onChain.sourceCreditExpiry,
      allocations: onChain.allocations,
      allocationCount: onChain.allocationCount,
      policyVersion: onChain.policyVersion,
    })
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
      refundDestination: booking?.payerInstitution ?? null,
      cutoff: booking?.start,
      cancellable: false,
    })
  }

  if (status !== 1 || bookingPrice === null) return null

  if (isFmu(booking)) {
    return buildPreview({
      source: 'local-fallback',
      status,
      price: bookingPrice,
      totalFee: 0n,
      providerFee: 0n,
      refund: bookingPrice,
      refundDestination: booking?.payerInstitution ?? null,
      cutoff: booking?.start,
      cancellable: false,
    })
  }

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
    refundDestination: booking?.payerInstitution ?? null,
    cutoff: booking?.start,
    cancellable: false,
  })
}

export function getCancellationRefundExpiryStatus(preview, now = Math.floor(Date.now() / 1000)) {
  if (!preview?.sourceCreditExpiryKnown) return 'unknown'
  if (preview.sourceCreditExpiry === null) return 'not-expiring'
  if (!Number.isSafeInteger(now) || now < 0) return 'unknown'
  return preview.sourceCreditExpiry <= now ? 'expired' : 'active'
}

export function getCancellationCreditReturnLabel(booking) {
  const amount = calculateCancellationCreditReturn(booking)
  return amount === null ? 'Unavailable until reservation details load' : `${formatRawCredits(amount)} credits`
}
