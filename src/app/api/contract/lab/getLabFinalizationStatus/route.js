import { createContractHandler } from '../../utils/createContractHandler'

const toSafeNumber = (value, field) => {
  if (value === null || value === undefined) {
    throw new Error(`Missing ${field} in finalization status`)
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid ${field} in finalization status`)
  }
  return parsed
}

export const { GET } = createContractHandler({
  params: [{ name: 'labId', type: 'number' }],
  method: 'getLabFinalizationStatus',
  transform: (result) => ({
    activeReservationCount: toSafeNumber(
      result?.activeReservationCount ?? result?.[0],
      'activeReservationCount',
    ),
    payoutHeapLength: toSafeNumber(result?.payoutHeapLength ?? result?.[1], 'payoutHeapLength'),
    payoutHeapInvalidCount: toSafeNumber(
      result?.payoutHeapInvalidCount ?? result?.[2],
      'payoutHeapInvalidCount',
    ),
    oldestPayoutCandidateEnd: toSafeNumber(
      result?.oldestPayoutCandidateEnd ?? result?.[3],
      'oldestPayoutCandidateEnd',
    ),
    lastFinalizationAt: toSafeNumber(result?.lastFinalizationAt ?? result?.[4], 'lastFinalizationAt'),
  }),
})
