import { createContractHandler } from '../../utils/createContractHandler'

export const { GET } = createContractHandler({
  auth: true,
  method: 'getLabTokenAddress',
  transform: (result) => ({ labTokenAddress: result }),
})

