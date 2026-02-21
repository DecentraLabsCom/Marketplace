/**
 * Tests for staking toast notification helpers
 */
import {
  stakingToastIds,
  notifyStakeStarted,
  notifyStakeSuccess,
  notifyStakeFailed,
  notifyUnstakeStarted,
  notifyUnstakeSuccess,
  notifyUnstakeFailed,
  notifyInsufficientStake,
} from '../stakingToasts'

describe('stakingToasts', () => {
  describe('stakingToastIds', () => {
    test('generates unique dedupe keys', () => {
      const ids = [
        stakingToastIds.stakeStarted(),
        stakingToastIds.stakeSuccess(),
        stakingToastIds.stakeFailed(),
        stakingToastIds.unstakeStarted(),
        stakingToastIds.unstakeSuccess(),
        stakingToastIds.unstakeFailed(),
        stakingToastIds.insufficientStake(),
      ]
      const unique = new Set(ids)
      expect(unique.size).toBe(ids.length)
    })

    test('all keys are strings', () => {
      Object.values(stakingToastIds).forEach((fn) => {
        expect(typeof fn()).toBe('string')
      })
    })
  })

  describe('notification functions', () => {
    let mockNotify

    beforeEach(() => {
      mockNotify = jest.fn()
    })

    test('notifyStakeStarted calls with pending type', () => {
      notifyStakeStarted(mockNotify, '100')
      expect(mockNotify).toHaveBeenCalledTimes(1)
      const [type, message] = mockNotify.mock.calls[0]
      expect(type).toBe('pending')
      expect(message).toContain('100')
      expect(message).toContain('$LAB')
    })

    test('notifyStakeSuccess calls with success type', () => {
      notifyStakeSuccess(mockNotify, '100')
      expect(mockNotify).toHaveBeenCalledTimes(1)
      expect(mockNotify.mock.calls[0][0]).toBe('success')
    })

    test('notifyStakeFailed calls with error type and message', () => {
      notifyStakeFailed(mockNotify, 'Insufficient balance')
      expect(mockNotify).toHaveBeenCalledTimes(1)
      const [type, message] = mockNotify.mock.calls[0]
      expect(type).toBe('error')
      expect(message).toContain('Insufficient balance')
    })

    test('notifyUnstakeStarted calls with pending type', () => {
      notifyUnstakeStarted(mockNotify, '50')
      expect(mockNotify).toHaveBeenCalledTimes(1)
      expect(mockNotify.mock.calls[0][0]).toBe('pending')
    })

    test('notifyUnstakeSuccess calls with success type', () => {
      notifyUnstakeSuccess(mockNotify, '50')
      expect(mockNotify).toHaveBeenCalledTimes(1)
      expect(mockNotify.mock.calls[0][0]).toBe('success')
    })

    test('notifyUnstakeFailed calls with error type', () => {
      notifyUnstakeFailed(mockNotify, 'Lock period active')
      expect(mockNotify).toHaveBeenCalledTimes(1)
      expect(mockNotify.mock.calls[0][0]).toBe('error')
    })

    test('notifyInsufficientStake calls with warning type', () => {
      notifyInsufficientStake(mockNotify, '200')
      expect(mockNotify).toHaveBeenCalledTimes(1)
      const [type, message] = mockNotify.mock.calls[0]
      expect(type).toBe('warning')
      expect(message).toContain('200')
    })

    test('all functions are safe with non-function first argument', () => {
      expect(() => notifyStakeStarted(null, '100')).not.toThrow()
      expect(() => notifyStakeSuccess(undefined, '100')).not.toThrow()
      expect(() => notifyStakeFailed('not-a-function', 'error')).not.toThrow()
    })
  })
})
