import { createContractHandler } from '../../utils/createContractHandler'

export const { GET } = createContractHandler({
  auth: true,
  params: [
    { name: 'institutionAddress', type: 'address' },
    { name: 'puc' },
  ],
  method: 'getInstitutionalUserRemainingAllowance',
  transform: (result, p) => ({
    remainingAllowance: result?.toString() || '0',
    institutionAddress: p.institutionAddress,
    puc: p.puc,
  }),
})
