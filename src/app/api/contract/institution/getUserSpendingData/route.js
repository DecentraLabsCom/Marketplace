import { createContractHandler } from '../../utils/createContractHandler'

export const { GET } = createContractHandler({
  auth: true,
  params: [
    { name: 'institutionAddress', type: 'address' },
    { name: 'pucHash', type: 'bytes32' }
  ],
  method: 'getInstitutionalUserSpendingData',
  transform: (result, { institutionAddress, pucHash }) => ({
    spendingData: {
      amount: result.amount?.toString() || result[0]?.toString?.() || '0',
      periodStart: result.periodStart?.toString() || result[1]?.toString?.() || '0'
    },
    institutionAddress,
    pucHash
  })
})
