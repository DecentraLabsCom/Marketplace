import { createContractHandler } from '../../utils/createContractHandler'

export const { GET } = createContractHandler({
  auth: true,
  params: [{ name: 'wallet', type: 'address' }],
  method: 'balanceOf',
  transform: (result, p) => ({ count: Number(result), wallet: p.wallet }),
})

