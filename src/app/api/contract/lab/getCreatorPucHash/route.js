import { createContractHandler } from '../../utils/createContractHandler'
import { readLabPucHash } from '@/utils/blockchain/labCreatorHash'

export const { GET } = createContractHandler({
  params: [{ name: 'labId', type: 'number' }],
  method: 'getPucHash',
  call: (contract, { labId }) => readLabPucHash(contract, labId),
  transform: (pucHash, { labId }) => ({
    labId,
    pucHash
  })
})
