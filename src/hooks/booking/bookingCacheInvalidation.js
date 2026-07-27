import { bookingQueryKeys } from '@/utils/hooks/queryKeys'

const hasLabId = (labId) => labId !== undefined && labId !== null && labId !== ''

/**
 * Returns the booking query filters affected by a terminal institutional
 * reservation transition. Prefix filters are intentional because several
 * queries are indexed by reservation position or availability window.
 */
export const getInstitutionalReservationQueryFilters = ({ labId, reservationKey } = {}) => {
  const filters = [
    { queryKey: bookingQueryKeys.ssoReservationsOf(), exact: false },
    { queryKey: bookingQueryKeys.ssoReservationKeyOfUserPrefix(), exact: false },
    { queryKey: bookingQueryKeys.ssoHasActiveBookingSession(), exact: false },
  ]

  if (hasLabId(labId)) {
    filters.push(
      { queryKey: bookingQueryKeys.getReservationsOfToken(labId), exact: false },
      { queryKey: bookingQueryKeys.reservationOfTokenPrefix(labId), exact: false },
      { queryKey: bookingQueryKeys.checkAvailablePrefix(labId), exact: false },
      { queryKey: bookingQueryKeys.ssoActiveReservationKeySession(labId), exact: false },
      { queryKey: bookingQueryKeys.ssoHasActiveBookingSessionByLab(labId), exact: false },
    )
  }

  if (reservationKey) {
    filters.push({
      queryKey: bookingQueryKeys.byReservationKey(reservationKey),
      exact: true,
    })
  }

  return filters
}

export const invalidateInstitutionalReservationQueries = (
  queryClient,
  context = {},
) => {
  if (!queryClient) return

  getInstitutionalReservationQueryFilters(context).forEach((filter) => {
    queryClient.invalidateQueries(filter)
  })
}
