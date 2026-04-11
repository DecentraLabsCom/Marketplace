import { createContractHandler } from '../../utils/createContractHandler'

export const { GET } = createContractHandler({
  auth: true,
  params: [
    { name: 'labId', type: 'number' },
    { name: 'index', type: 'number' },
  ],
  method: 'getReservationOfTokenByIndex',
  transform: (result, p) => ({ reservationKey: result.toString(), labId: p.labId, index: p.index }),
})

