import { createContractHandler } from '../../utils/createContractHandler'

export const { GET } = createContractHandler({
  auth: true,
  params: [{ name: 'userAddress', type: 'address' }],
  method: 'reservationsOf',
  transform: (result, p) => ({ count: Number(result), userAddress: p.userAddress }),
})

