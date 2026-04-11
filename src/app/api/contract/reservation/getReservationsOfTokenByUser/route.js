import { createContractHandler } from '../../utils/createContractHandler'

export const { GET } = createContractHandler({
  params: [
    { name: 'labId', type: 'number' },
    { name: 'userAddress', type: 'address' },
    { name: 'offset', type: 'number', optional: true, default: 0 },
    { name: 'limit', type: 'number', optional: true, default: 50, min: 1, max: 100 }
  ],
  method: 'getReservationsOfTokenByUserPaginated',
  transform: ([keys, total], { labId, userAddress, offset, limit }) => ({
    labId,
    userAddress,
    offset,
    limit,
    total: Number(total ?? 0),
    keys: Array.isArray(keys) ? keys.map(k => k.toString()) : []
  })
})
