import { createContractHandler } from '../../utils/createContractHandler'

export const { GET } = createContractHandler({
  auth: true,
  params: [
    { name: 'offset', type: 'number', optional: true, default: 0 },
    { name: 'limit', type: 'number', optional: true, default: 100, min: 1, max: 500 }
  ],
  method: 'getInstitutionsPaginated',
  transform: ([institutions, total], { offset, limit }) => ({
    institutions: institutions.map(addr => addr.toString()),
    total: Number(total),
    offset,
    limit
  })
})
