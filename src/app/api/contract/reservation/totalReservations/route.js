import { createContractHandler } from '../../utils/createContractHandler'

export const { GET } = createContractHandler({
  auth: true,
  method: 'totalReservations',
  transform: (result) => ({ totalReservations: result.toString() }),
})

