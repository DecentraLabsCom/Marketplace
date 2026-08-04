import {
  DIRECT_BOOKING_ACTION,
  IntentPrepareValidationError,
  MIN_RESERVATION_LEAD_TIME_SECONDS,
  validateReservationPayload,
  validateReservationWindow,
} from '@/utils/intents/prepareValidation'

describe('reservation intent window validation', () => {
  const nowSeconds = 1_700_000_000

  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(nowSeconds * 1000)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  test('rejects a reservation whose start does not leave enough authorization lead time', () => {
    expect(() => validateReservationWindow({
      labId: 42,
      start: nowSeconds + MIN_RESERVATION_LEAD_TIME_SECONDS - 1,
      end: nowSeconds + 900,
    })).toThrow(new IntentPrepareValidationError('Reservation start does not leave enough authorization lead time'))
  })

  test.each([8, DIRECT_BOOKING_ACTION])('accepts a reservation at the minimum lead time for action %s', (action) => {
    expect(() => validateReservationPayload(action, {
      labId: 42,
      start: nowSeconds + MIN_RESERVATION_LEAD_TIME_SECONDS,
      end: nowSeconds + MIN_RESERVATION_LEAD_TIME_SECONDS + 300,
    })).not.toThrow()
  })
})
