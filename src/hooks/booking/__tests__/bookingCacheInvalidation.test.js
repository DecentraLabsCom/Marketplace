import {
  getInstitutionalReservationQueryFilters,
  invalidateInstitutionalReservationQueries,
} from '../bookingCacheInvalidation';
import { bookingQueryKeys } from '@/utils/hooks/queryKeys';

describe('booking cache invalidation', () => {
  test('builds a complete lab-scoped invalidation set', () => {
    const filters = getInstitutionalReservationQueryFilters({
      labId: 7,
      reservationKey: 'reservation-7',
    });

    expect(filters).toEqual(expect.arrayContaining([
      { queryKey: bookingQueryKeys.ssoReservationsOf(), exact: false },
      { queryKey: bookingQueryKeys.ssoReservationKeyOfUserPrefix(), exact: false },
      { queryKey: bookingQueryKeys.ssoHasActiveBookingSession(), exact: false },
      { queryKey: bookingQueryKeys.getReservationsOfToken('7'), exact: false },
      { queryKey: bookingQueryKeys.reservationOfTokenPrefix('7'), exact: false },
      { queryKey: bookingQueryKeys.checkAvailablePrefix('7'), exact: false },
      { queryKey: bookingQueryKeys.ssoActiveReservationKeySession('7'), exact: false },
      { queryKey: bookingQueryKeys.ssoHasActiveBookingSessionByLab('7'), exact: false },
      { queryKey: bookingQueryKeys.byReservationKey('reservation-7'), exact: true },
    ]));
  });

  test('invalidates every filter, including prefix filters', () => {
    const queryClient = { invalidateQueries: jest.fn() };

    invalidateInstitutionalReservationQueries(queryClient, {
      labId: '7',
      reservationKey: 'reservation-7',
    });

    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(9);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: bookingQueryKeys.checkAvailablePrefix('7'),
      exact: false,
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: bookingQueryKeys.byReservationKey('reservation-7'),
      exact: true,
    });
  });
});
