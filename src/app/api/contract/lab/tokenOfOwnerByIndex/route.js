import { createContractHandler } from '../../utils/createContractHandler'

export const { GET } = createContractHandler({
  auth: true,
  params: [
    { name: 'wallet', type: 'address' },
    { name: 'index', type: 'number' },
  ],
  method: 'tokenOfOwnerByIndex',
  transform: (result, p) => ({ labId: result.toString(), index: p.index, wallet: p.wallet }),
})

