import { createContractHandler } from '../../utils/createContractHandler'

const ZERO_KEY = '0x0000000000000000000000000000000000000000000000000000000000000000'

export const { GET } = createContractHandler({
  auth: true,
  params: [
    { name: 'labId', type: 'string' },
    { name: 'userAddress', type: 'address' }
  ],
  method: 'getActiveReservationKeyForUser',
  transform: (reservationKey, { labId, userAddress }) => ({
    reservationKey,
    hasActiveBooking: reservationKey !== ZERO_KEY,
    labId,
    userAddress
  }),
  onError: (error) => {
    if (
      error.code === 'CALL_EXCEPTION' ||
      error.message?.includes('reverted') ||
      error.message?.includes('execution reverted')
    ) {
      return Response.json({
        reservationKey: ZERO_KEY,
        hasActiveBooking: false,
        note: 'No active booking or lab not found'
      }, { status: 200 })
    }
  }
})
