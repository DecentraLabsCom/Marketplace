import { createContractHandler } from '../../utils/createContractHandler'

export const { GET } = createContractHandler({
  params: [{ name: 'labId' }],
  method: 'getLabAuthURI',
  transform: (result) => ({ authURI: result }),
})
