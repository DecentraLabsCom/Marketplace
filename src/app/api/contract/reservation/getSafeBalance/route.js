import { createContractHandler } from '../../utils/createContractHandler'

export const { GET } = createContractHandler({
  auth: true,
  method: 'getSafeBalance',
  transform: (result) => ({ safeBalance: result.toString() }),
})

