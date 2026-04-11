import { createContractHandler } from '../../utils/createContractHandler'

export const { GET } = createContractHandler({
  auth: true,
  params: [{ name: 'institutionAddress', type: 'address' }],
  method: 'getInstitutionalTreasuryBalance',
  transform: (result, p) => ({ balance: result?.toString() || '0', institutionAddress: p.institutionAddress }),
})

