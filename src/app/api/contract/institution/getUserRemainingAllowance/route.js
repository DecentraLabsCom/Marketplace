import { createContractHandler } from '../../utils/createContractHandler'

export const { GET } = createContractHandler({
  auth: true,
  params: [
    { name: 'institutionAddress', type: 'address' },
    { name: 'pucHash', type: 'bytes32' },
  ],
  method: 'getInstitutionalUserRemainingAllowance',
  transform: (result, p) => ({
    remainingAllowance: result?.toString() || '0',
    institutionAddress: p.institutionAddress,
    pucHash: p.pucHash,
  }),
})
