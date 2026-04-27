import { createContractHandler } from '../../utils/createContractHandler'

export const { GET } = createContractHandler({
  params: [{ name: 'labId', type: 'number' }],
  method: 'getReservationsOfToken',
  transform: (result, p) => ({
    count: Number(result),
    labId: p.labId,
  }),
})
