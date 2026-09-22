import {
  getLabReputationFreshness,
  REPUTATION_FRESHNESS,
} from '../labStats'

describe('getLabReputationFreshness', () => {
  const reputation = { score: 4, totalEvents: 4 }

  test('returns no status while the on-chain status query is pending', () => {
    expect(getLabReputationFreshness({
      reputation,
      finalizationStatusReady: false,
    })).toBeNull()
  })

  test('returns current when there is no overdue live candidate', () => {
    expect(getLabReputationFreshness({
      reputation,
      finalizationStatusReady: true,
      finalizationStatus: {
        activeReservationCount: 1,
        payoutHeapLength: 2,
        payoutHeapInvalidCount: 1,
        oldestPayoutCandidateEnd: 2_000,
      },
      nowSeconds: 1_000,
    })).toBe(REPUTATION_FRESHNESS.CURRENT)
  })

  test('returns pending when the heap contains an overdue live candidate', () => {
    expect(getLabReputationFreshness({
      reputation,
      finalizationStatusReady: true,
      finalizationStatus: {
        activeReservationCount: 2,
        payoutHeapLength: 2,
        payoutHeapInvalidCount: 0,
        oldestPayoutCandidateEnd: 900,
      },
      nowSeconds: 1_000,
    })).toBe(REPUTATION_FRESHNESS.PENDING)
  })

  test('returns unknown when the status query fails', () => {
    expect(getLabReputationFreshness({
      reputation,
      finalizationStatusReady: false,
      finalizationStatusError: new Error('RPC unavailable'),
    })).toBe(REPUTATION_FRESHNESS.UNKNOWN)
  })

  test('does not create a freshness badge for a lab without reputation events', () => {
    expect(getLabReputationFreshness({
      reputation: { score: 0, totalEvents: 0 },
      finalizationStatusReady: true,
      finalizationStatus: {
        activeReservationCount: 0,
        payoutHeapLength: 0,
        payoutHeapInvalidCount: 0,
        oldestPayoutCandidateEnd: 0,
      },
      nowSeconds: 1_000,
    })).toBeNull()
  })

  test('returns unknown for malformed successful status data', () => {
    expect(getLabReputationFreshness({
      reputation,
      finalizationStatusReady: true,
      finalizationStatus: { payoutHeapLength: 'not-a-number' },
      nowSeconds: 1_000,
    })).toBe(REPUTATION_FRESHNESS.UNKNOWN)
  })

  test('returns unknown when the active counter and live heap entries disagree', () => {
    expect(getLabReputationFreshness({
      reputation,
      finalizationStatusReady: true,
      finalizationStatus: {
        activeReservationCount: 2,
        payoutHeapLength: 2,
        payoutHeapInvalidCount: 1,
        oldestPayoutCandidateEnd: 2_000,
      },
      nowSeconds: 1_000,
    })).toBe(REPUTATION_FRESHNESS.UNKNOWN)
  })
})
