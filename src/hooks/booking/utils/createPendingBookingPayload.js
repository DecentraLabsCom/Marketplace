import { BOOKING_STATE, normalizeBookingStatusState } from '@/utils/booking/bookingStatus'

const normalizeMaybeBigInt = (value) => {
  if (typeof value === 'bigint') return value.toString()
  return value
}

const toFiniteNumber = (value) => {
  const normalized = normalizeMaybeBigInt(value)
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

const toCalendarDate = (unixSeconds) => {
  const parsed = toFiniteNumber(unixSeconds)
  if (parsed === null || parsed <= 0) return null
  const date = new Date(parsed * 1000)
  return isNaN(date.getTime()) ? null : date.toLocaleDateString('en-CA')
}

/**
 * Creates a normalized pending/optimistic reservation payload used by both wallet and SSO flows.
 * Accepts a partially-normalized booking object plus optional flags and metadata.
 */
export default function createPendingBookingPayload({
  reservationKey,
  tokenId,
  labId,
  userAddress,
  start,
  end,
  status = 'pending',
  transactionHash,
  intentRequestId,
  intentStatus,
  note,
  isOptimistic = true,
  isProcessing = false,
  now,
  idFactory,
  extra = {},
} = {}) {
  const baseNow = now instanceof Date
    ? now
    : (now !== undefined && now !== null ? new Date(now) : new Date())
  const fallbackNow = isNaN(baseNow.getTime()) ? new Date() : baseNow
  const generatedId = typeof idFactory === 'function'
    ? idFactory()
    : `temp-${fallbackNow.getTime()}`
  const resolvedLabId = normalizeMaybeBigInt(labId ?? tokenId)
  const resolvedKey = normalizeMaybeBigInt(reservationKey || generatedId)
  const normalizedStart = normalizeMaybeBigInt(start)
  const normalizedEnd = normalizeMaybeBigInt(end)
  const startNumeric = toFiniteNumber(normalizedStart)
  const endNumeric = toFiniteNumber(normalizedEnd)
  const hasStart = startNumeric !== null && startNumeric > 0
  const hasEnd = endNumeric !== null && endNumeric > 0
  const semanticStatus =
    normalizeBookingStatusState({ status, isPending: true, statusCategory: 'pending' }) ||
    BOOKING_STATE.PENDING

  return {
    ...extra,
    id: resolvedKey,
    reservationKey: resolvedKey,
    tokenId: normalizeMaybeBigInt(tokenId ?? resolvedLabId),
    labId: resolvedLabId,
    userAddress: userAddress || undefined,
    start: hasStart ? String(normalizedStart) : normalizedStart,
    end: hasEnd ? String(normalizedEnd) : normalizedEnd,
    startTime: hasStart ? startNumeric : normalizedStart,
    endTime: hasEnd ? endNumeric : normalizedEnd,
    date: toCalendarDate(normalizedStart),
    status: semanticStatus,
    statusCategory: 'pending',
    isPending: true,
    isOptimistic,
    isProcessing,
    ...(transactionHash ? { transactionHash: normalizeMaybeBigInt(transactionHash) } : {}),
    ...(intentRequestId ? { intentRequestId: normalizeMaybeBigInt(intentRequestId) } : {}),
    ...(intentStatus ? { intentStatus } : {}),
    ...(note ? { note } : {}),
    timestamp: fallbackNow.toISOString(),
  }
}
