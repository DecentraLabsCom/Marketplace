import { createContractHandler } from '../../utils/createContractHandler'
import { readLabCreatorPucHash } from '@/utils/blockchain/labCreatorHash'

export const { GET } = createContractHandler({
  params: [{ name: 'labId', type: 'number' }],
  method: 'getCreatorPucHash',
  call: (contract, { labId }) => readLabCreatorPucHash(contract, labId),
  transform: (creatorPucHash, { labId }) => ({
    labId,
    creatorPucHash
  })
})
