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
