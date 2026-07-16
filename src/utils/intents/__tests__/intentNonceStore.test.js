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
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce('OK')
      .mockResolvedValueOnce(1)

    let lease
    const result = await withIntentSignerLock(
      '0x00000000000000000000000000000000000000a1',
      async (context) => {
        lease = context
        return 'registered'
      },
      { waitMs: 0 },
    )

    expect(result).toBe('registered')
    expect(lease.fencingToken).toBe(1)
    expect(typeof lease.assertActive).toBe('function')
    expect(redisCommand).toHaveBeenCalledTimes(3)
    expect(redisCommand.mock.calls[0][0][0]).toBe('INCR')
    expect(redisCommand.mock.calls[1][0][0]).toBe('SET')
    expect(redisCommand.mock.calls[1][0]).toContain('NX')
    expect(redisCommand.mock.calls[2][0][0]).toBe('EVAL')
  })

  test('reports contention instead of allowing a second signer operation', async () => {
    redisCommand.mockResolvedValue(null)

    await expect(withIntentSignerLock(
      '0x00000000000000000000000000000000000000a1',
      async () => 'must not run',
      { waitMs: 0 },
    )).rejects.toBeInstanceOf(IntentSignerBusyError)
  })

  test('renews the signer lease before a privileged step', async () => {
    redisCommand
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce('OK')
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)

    await withIntentSignerLock(
      '0x00000000000000000000000000000000000000a1',
      async (lease) => {
        await lease.assertActive()
      },
      { waitMs: 0 },
    )

    const renewal = redisCommand.mock.calls[2][0]
    expect(renewal[0]).toBe('EVAL')
    expect(renewal).toContain('120000')
  })

  test('reports a failed signer operation while its lease is still held', async () => {
    redisCommand
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce('OK')
      .mockResolvedValueOnce(1)

    const onError = jest.fn()
    await expect(withIntentSignerLock(
      '0x00000000000000000000000000000000000000a1',
      async () => {
        throw new Error('contract write failed')
      },
      { waitMs: 0, onError },
    )).rejects.toThrow('contract write failed')

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'contract write failed' }),
      expect.objectContaining({ fencingToken: 8 }),
    )
    expect(onError.mock.invocationCallOrder[0]).toBeLessThan(
      redisCommand.mock.invocationCallOrder[2],
    )
  })

  test('does not enter the critical section when Redis cannot acquire the lock', async () => {
    redisCommand.mockRejectedValue(new Error('Redis unavailable'))

    await expect(withIntentSignerLock(
      '0x00000000000000000000000000000000000000a1',
      async () => 'must not run',
    )).rejects.toBeInstanceOf(IntentSignerUnavailableError)
  })

  test('fails closed with a coordination error in production without Redis', async () => {
    hasRedisConfig.mockReturnValue(false)
    const previousNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'

    try {
      await expect(withIntentSignerLock(
        '0x00000000000000000000000000000000000000a1',
        async () => 'must not run',
      )).rejects.toBeInstanceOf(IntentSignerUnavailableError)
    } finally {
      process.env.NODE_ENV = previousNodeEnv
    }
  })
})
