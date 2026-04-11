import { createContractHandler } from '../../utils/createContractHandler'

export const { GET } = createContractHandler({
  auth: true,
  params: [
    { name: 'tokenId' },
    { name: 'user' },
  ],
  method: 'hasActiveBookingByToken',
  transform: (result, p) => ({
    tokenId: p.tokenId,
    user: p.user,
    hasActiveBooking: result,
  }),
})

