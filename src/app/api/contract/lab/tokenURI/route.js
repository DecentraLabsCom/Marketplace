import { createContractHandler } from '../../utils/createContractHandler'

export const { GET } = createContractHandler({
  params: [{ name: 'labId' }],
  method: 'tokenURI',
  transform: (result, p) => ({ labId: p.labId, tokenURI: result }),
})
