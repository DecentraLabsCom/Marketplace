import { isReservationIntentActionAllowed, resolveIntentState } from '../adminIntentSigner'
import { INTENT_STATE } from '../intentState'

describe('adminIntentSigner action allowlists', () => {
  test('allows DIRECT_BOOKING as a reservation intent action', () => {
    expect(isReservationIntentActionAllowed(11)).toBe(true)
  })

  test('maps every on-chain lifecycle value without shifting the enum', () => {
    expect(Object.values(INTENT_STATE).map((state) => resolveIntentState({ state }))).toEqual([
      { state: INTENT_STATE.NONE, stateName: 'none' },
      { state: INTENT_STATE.PENDING, stateName: 'pending' },
      { state: INTENT_STATE.EXECUTED, stateName: 'executed' },
      { state: INTENT_STATE.CANCELLED, stateName: 'cancelled' },
      { state: INTENT_STATE.EXPIRED, stateName: 'expired' },
    ])
  })
})
