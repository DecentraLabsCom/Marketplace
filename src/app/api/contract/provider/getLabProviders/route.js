import { createContractHandler } from '../../utils/createContractHandler'

export const { GET } = createContractHandler({
  method: 'getLabProviders',
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
