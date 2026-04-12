import { createContractHandler } from '../../utils/createContractHandler'

export const { GET } = createContractHandler({
  params: [{ name: 'labId', type: 'number' }],
  method: 'getLabReservationCount',
  transform: (result, p) => ({
    count: Number(result),
    labId: p.labId,
    // Temporary compatibility seam.
    // Remove this flag when Reservation_Reads_Compatibility reintroduces
    // reservation enumeration (on-chain) or replaces this read with backend projection.
    enumerableReservations: false,
  }),
})
