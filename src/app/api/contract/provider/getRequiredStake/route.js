import { createContractHandler } from '../../utils/createContractHandler'

export const { GET } = createContractHandler({
  params: [{ name: 'provider', type: 'address' }],
  method: 'getRequiredStake',
  transform: (result, { provider }) => ({
    requiredStake: result?.toString() || '0',
    provider: provider.toLowerCase()
  })
})
