import {
  isReservationConfirmedStatus,
  normalizeReservationStatus,
} from '../reservationStatus'

describe('reservation status semantics', () => {
  test('does not treat an executed intent without a reservation state as confirmed', () => {
    expect(normalizeReservationStatus(undefined)).toBe('unknown')
    expect(isReservationConfirmedStatus(undefined)).toBe(false)
    expect(isReservationConfirmedStatus('unknown')).toBe(false)
    expect(isReservationConfirmedStatus('pending')).toBe(false)
  })

  test('treats only confirmed or later on-chain lifecycle states as confirmed', () => {
    expect(isReservationConfirmedStatus('confirmed')).toBe(true)
    expect(isReservationConfirmedStatus('access_authorized')).toBe(true)
    expect(isReservationConfirmedStatus('settled')).toBe(true)
    expect(isReservationConfirmedStatus('cancelled')).toBe(false)
  })
})
