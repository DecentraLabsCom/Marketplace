/**
 * @jest-environment node
 */

jest.mock('@/utils/redis/restClient', () => ({
  hasRedisConfig: jest.fn(() => true),
  redisCommand: jest.fn(),
}))

jest.mock('@/app/api/contract/utils/contractInstance', () => ({
  getContractInstance: jest.fn(),
}))

import { hasRedisConfig, redisCommand } from '@/utils/redis/restClient'
import {
  IntentSignerBusyError,
  IntentSignerUnavailableError,
  withIntentSignerLock,
} from '../intentNonceStore'

describe('intent signer coordination', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    hasRedisConfig.mockReturnValue(true)
  })

  test('holds and releases a distributed signer lock around the critical section', async () => {
    redisCommand
      .mockResolvedValueOnce('OK')
      .mockResolvedValueOnce(1)

    const result = await withIntentSignerLock(
      '0x00000000000000000000000000000000000000a1',
      async () => 'registered',
      { waitMs: 0 },
    )

    expect(result).toBe('registered')
    expect(redisCommand).toHaveBeenCalledTimes(2)
    expect(redisCommand.mock.calls[0][0][0]).toBe('SET')
    expect(redisCommand.mock.calls[0][0]).toContain('NX')
    expect(redisCommand.mock.calls[1][0][0]).toBe('EVAL')
  })

  test('reports contention instead of allowing a second signer operation', async () => {
    redisCommand.mockResolvedValue(null)

    await expect(withIntentSignerLock(
      '0x00000000000000000000000000000000000000a1',
      async () => 'must not run',
      { waitMs: 0 },
    )).rejects.toBeInstanceOf(IntentSignerBusyError)
  })

  test('does not enter the critical section when Redis cannot acquire the lock', async () => {
    redisCommand.mockRejectedValue(new Error('Redis unavailable'))

    await expect(withIntentSignerLock(
      '0x00000000000000000000000000000000000000a1',
      async () => 'must not run',
    )).rejects.toBeInstanceOf(IntentSignerUnavailableError)
  })
})
