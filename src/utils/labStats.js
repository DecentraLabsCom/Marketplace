const parseNumber = (value) => {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const REPUTATION_FRESHNESS = Object.freeze({
  CURRENT: 'current',
  PENDING: 'pending',
  UNKNOWN: 'unknown',
})

export const REPUTATION_FRESHNESS_LABELS = Object.freeze({
  [REPUTATION_FRESHNESS.CURRENT]: 'Updated',
  [REPUTATION_FRESHNESS.PENDING]: 'Pending update',
  [REPUTATION_FRESHNESS.UNKNOWN]: 'Not verifiable',
})

export const REPUTATION_FRESHNESS_DESCRIPTIONS = Object.freeze({
  [REPUTATION_FRESHNESS.CURRENT]: 'No overdue reservation finalization is visible on-chain. This does not independently verify the underlying reputation evidence.',
  [REPUTATION_FRESHNESS.PENDING]: 'At least one overdue reservation finalization candidate is visible on-chain; the rating and event count may change.',
  [REPUTATION_FRESHNESS.UNKNOWN]: 'The on-chain reservation finalization state could not be verified; the rating and event count are still shown.',
})

/**
 * Derives the user-facing freshness state from the reputation and the
 * bounded on-chain finalization signals. A pending state means that the
 * contract exposes an overdue live heap candidate; it is intentionally not
 * presented as proof that every candidate is immediately finalizable.
 */
export const getLabReputationFreshness = ({
  reputation,
  finalizationStatus,
  finalizationStatusReady = false,
  finalizationStatusError = null,
  nowSeconds = Math.floor(Date.now() / 1000),
} = {}) => {
  const totalEvents = parseNumber(reputation?.totalEvents)
  if (totalEvents === null || totalEvents <= 0) return null

  if (finalizationStatusError) return REPUTATION_FRESHNESS.UNKNOWN
  if (!finalizationStatusReady) return null
  if (!finalizationStatus) return REPUTATION_FRESHNESS.UNKNOWN

  const activeReservationCount = parseNumber(finalizationStatus.activeReservationCount)
  const heapLength = parseNumber(finalizationStatus.payoutHeapLength)
  const invalidCount = parseNumber(finalizationStatus.payoutHeapInvalidCount)
  const oldestCandidateEnd = parseNumber(finalizationStatus.oldestPayoutCandidateEnd)
  const now = parseNumber(nowSeconds)

  if (
    activeReservationCount === null
    || heapLength === null
    || invalidCount === null
    || oldestCandidateEnd === null
    || now === null
    || activeReservationCount < 0
    || heapLength < 0
    || invalidCount < 0
    || invalidCount > heapLength
    || oldestCandidateEnd < 0
  ) {
    return REPUTATION_FRESHNESS.UNKNOWN
  }

  if (activeReservationCount !== heapLength - invalidCount) {
    return REPUTATION_FRESHNESS.UNKNOWN
  }

  const hasOverdueLiveCandidate = heapLength > invalidCount
    && oldestCandidateEnd > 0
    && oldestCandidateEnd <= now

  return hasOverdueLiveCandidate
    ? REPUTATION_FRESHNESS.PENDING
    : REPUTATION_FRESHNESS.CURRENT
}

export const getLabRatingValue = (reputation) => {
  if (!reputation) return null

  const totalEvents = parseNumber(reputation.totalEvents)
  const score = parseNumber(reputation.score)

  if (totalEvents === null || score === null) return null
  if (totalEvents <= 0) return null

  const ratio = (score / totalEvents + 1) / 2
  const rating = Math.max(0, Math.min(5, ratio * 5))

  return Math.round(rating * 10) / 10
}

export const getLabAgeLabel = (createdAtSeconds) => {
  const createdAt = parseNumber(createdAtSeconds)
  if (!createdAt) return null

  const diffMs = Math.max(0, Date.now() - createdAt * 1000)
  const days = Math.floor(diffMs / 86400000)

  if (days < 1) return '0d'
  if (days < 30) return `${days}d`

  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo`

  const years = Math.floor(months / 12)
  const remainingMonths = months % 12

  return remainingMonths ? `${years}y ${remainingMonths}mo` : `${years}y`
}
