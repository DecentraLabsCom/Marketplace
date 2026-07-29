// Keep this numeric contract in one place. The values must match
// contracts/libraries/IntentTypes.sol exactly.
export const INTENT_STATE = Object.freeze({
  NONE: 0,
  PENDING: 1,
  EXECUTED: 2,
  CANCELLED: 3,
  EXPIRED: 4,
})

const INTENT_STATE_NAMES = Object.freeze(
  Object.fromEntries(
    Object.entries(INTENT_STATE).map(([name, value]) => [String(value), name.toLowerCase()]),
  ),
)

export function getIntentStateName(state) {
  return INTENT_STATE_NAMES[String(Number(state))] || 'unknown'
}
