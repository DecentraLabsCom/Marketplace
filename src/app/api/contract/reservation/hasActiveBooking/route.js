import { createContractHandler } from '../../utils/createContractHandler'

export const { GET } = createContractHandler({
  auth: true,
  params: [
    { name: 'reservationKey' },
    { name: 'userAddress' },
  ],
  method: 'hasActiveBooking',
  transform: (result, p) => ({
    reservationKey: p.reservationKey,
    userAddress: p.userAddress,
    hasActiveBooking: result,
  }),
})

