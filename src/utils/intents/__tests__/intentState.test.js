import { INTENT_STATE, getIntentStateName } from '../intentState'

describe('intent lifecycle state contract', () => {
  test('matches the Solidity enum values exactly', () => {
    expect(INTENT_STATE).toEqual({
      NONE: 0,
      PENDING: 1,
      EXECUTED: 2,
      CANCELLED: 3,
      EXPIRED: 4,
    })
  })

  test('derives names from the shared definition', () => {
    expect(Object.values(INTENT_STATE).map(getIntentStateName)).toEqual([
      'none',
      'pending',
      'executed',
      'cancelled',
      'expired',
    ])
    expect(getIntentStateName(99)).toBe('unknown')
  })
})
