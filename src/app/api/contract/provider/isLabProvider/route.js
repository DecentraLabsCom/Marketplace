import { createContractHandler } from '../../utils/createContractHandler'

export const { GET } = createContractHandler({
  params: [{ name: 'wallet', type: 'address' }],
  method: 'isLabProvider',
  transform: (result, p) => ({ wallet: p.wallet.toLowerCase(), isLabProvider: Boolean(result), checked: true }),
})