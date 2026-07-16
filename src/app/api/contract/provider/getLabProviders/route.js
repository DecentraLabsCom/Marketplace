import { createContractHandler } from '../../utils/createContractHandler'
import { getAllLabProviders } from '@/server/contract/getAllLabProviders'

export const { GET } = createContractHandler({
  call: getAllLabProviders,
  transform: (providers) => ({
    providers: providers.map(provider => ({
      account: provider.account,
      name: provider.base.name,
      email: provider.base.email,
      country: provider.base.country,
      authURI: provider.base.authURI || ''
    })),
    count: providers.length,
    timestamp: new Date().toISOString()
  })
})
