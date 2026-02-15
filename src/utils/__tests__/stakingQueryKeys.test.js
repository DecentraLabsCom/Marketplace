/**
 * Tests for staking query keys
 */
import { stakingQueryKeys } from '../hooks/queryKeys'

describe('stakingQueryKeys', () => {
  test('all() returns base staking key', () => {
    expect(stakingQueryKeys.all()).toEqual(['staking'])
  })

  test('stakeInfo() includes provider address', () => {
    expect(stakingQueryKeys.stakeInfo('0x1234')).toEqual(['staking', 'stakeInfo', '0x1234'])
  })

  test('requiredStake() includes provider address', () => {
    expect(stakingQueryKeys.requiredStake('0xabcd')).toEqual(['staking', 'requiredStake', '0xabcd'])
  })

  test('pendingPayout() includes lab ID', () => {
    expect(stakingQueryKeys.pendingPayout(42)).toEqual(['staking', 'pendingPayout', 42])
  })

  test('pendingPayoutsMulti() sorts lab IDs for cache consistency', () => {
    const result = stakingQueryKeys.pendingPayoutsMulti([3, 1, 2])
    expect(result).toEqual(['staking', 'pendingPayouts', 1, 2, 3])
  })

  test('pendingPayoutsMulti() handles null/undefined gracefully', () => {
    const result = stakingQueryKeys.pendingPayoutsMulti(null)
    expect(result).toEqual(['staking', 'pendingPayouts'])
  })

  test('lockPeriod() returns static key', () => {
    expect(stakingQueryKeys.lockPeriod()).toEqual(['staking', 'lockPeriod'])
  })

  test('each key factory returns a new array (cache safety)', () => {
    const a = stakingQueryKeys.stakeInfo('0x1')
    const b = stakingQueryKeys.stakeInfo('0x1')
    expect(a).toEqual(b)
    expect(a).not.toBe(b) // Different references
  })
})
