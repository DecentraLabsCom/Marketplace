import { createContractHandler } from '../../utils/createContractHandler'

export const { GET } = createContractHandler({
  auth: true,
  params: [{ name: 'institutionAddress', type: 'address' }],
  method: 'getInstitutionalUserLimit',
  transform: (result, p) => ({ limit: result?.toString() || '0', institutionAddress: p.institutionAddress }),
})

