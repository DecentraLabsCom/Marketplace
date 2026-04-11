import { createContractHandler } from '../../utils/createContractHandler'

export const { GET } = createContractHandler({
  auth: true,
  params: [
    { name: 'userAddress', type: 'address' },
    { name: 'index', type: 'number' }
  ],
  method: 'reservationKeyOfUserByIndex',
  transform: (result, { userAddress, index }) => ({
    reservationKey: result.toString(),
    userAddress,
    index
  }),
  onError: (error) => {
    const isOutOfBounds =
      error.code === 'CALL_EXCEPTION' ||
      error.message?.includes('out of bounds') ||
      error.message?.includes('index out of range')
    if (isOutOfBounds) {
      return Response.json(
        { error: 'Index out of range' },
        { status: 400 }
      )
    }
  }
})
