import { createContractHandler } from '../../utils/createContractHandler'

const toNumber = (value) => {
  if (value === null || value === undefined) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export const { GET } = createContractHandler({
  params: [{ name: 'labId', type: 'number' }],
  method: 'getLabReputation',
  transform: (result) => ({
    score: toNumber(result?.score ?? result?.[0]),
    totalEvents: toNumber(result?.totalEvents ?? result?.[1]),
    ownerCancellations: toNumber(result?.ownerCancellations ?? result?.[2]),
    institutionalCancellations: toNumber(result?.institutionalCancellations ?? result?.[3]),
    lastUpdated: toNumber(result?.lastUpdated ?? result?.[4])
  })
})
