import { createContractHandler } from '../../utils/createContractHandler'

export const { GET } = createContractHandler({
  auth: true,
  params: [{ name: 'reservationKey' }],
  method: 'userOfReservation',
  transform: (result, p) => ({ reservationKey: p.reservationKey, userAddress: result }),
})

