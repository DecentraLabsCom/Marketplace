import { isReservationIntentActionAllowed } from '../adminIntentSigner'

describe('adminIntentSigner action allowlists', () => {
  test('allows DIRECT_BOOKING as a reservation intent action', () => {
    expect(isReservationIntentActionAllowed(11)).toBe(true)
  })
})
