import { createContractHandler } from '../../utils/createContractHandler'

export const { GET } = createContractHandler({
  params: [{ name: 'provider', type: 'address' }],
  method: 'getStakeInfo',
  transform: (result) => ({
    stakedAmount: (result?.stakedAmount ?? result?.[0])?.toString() || '0',
    slashedAmount: (result?.slashedAmount ?? result?.[1])?.toString() || '0',
    lastReservationTimestamp: Number(result?.lastReservationTimestamp ?? result?.[2] ?? 0),
    unlockTimestamp: Number(result?.unlockTimestamp ?? result?.[3] ?? 0),
    canUnstake: Boolean(result?.canUnstake ?? result?.[4] ?? false)
  })
})
