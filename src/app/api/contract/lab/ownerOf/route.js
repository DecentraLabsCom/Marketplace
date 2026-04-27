import { createContractHandler } from '../../utils/createContractHandler'

export const { GET } = createContractHandler({
  params: [{ name: 'labId', type: 'number' }],
  method: 'ownerOf',
  transform: (result, p) => ({ labId: p.labId, owner: result }),
})
