/**
 * @jest-environment node
 */

jest.mock('@/utils/redis/restClient', () => ({
  hasRedisConfig: jest.fn(),
  redisCommand: jest.fn(),
}))

import { hasRedisConfig, redisCommand } from '@/utils/redis/restClient'
import {
  getRegisteredIntent,
  listRegisteredIntentIds,
  recordRegisteredIntent,
  removeRegisteredIntent,
} from '../intentLifecycleStore'

describe('intentLifecycleStore', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    hasRedisConfig.mockReturnValue(true)
  })

  test('persists the intent record and index so a later Marketplace instance can restore it', async () => {
    redisCommand.mockResolvedValue('OK')

    await expect(recordRegisteredIntent({
      requestId: 'req-restart',
      authorizationSessionId: 'session-1',
      institutionDomain: 'example.edu',
      expiresAt: 1_900_000_000,
    })).resolves.toBe(true)

    expect(redisCommand).toHaveBeenNthCalledWith(1, expect.arrayContaining([
      'SET',
      'marketplace:intent-lifecycle:req-restart',
    ]))
    expect(redisCommand).toHaveBeenNthCalledWith(2, [
      'SADD',
      'marketplace:intent-lifecycle:index',
      'req-restart',
    ])

    const storedRecord = {
      requestId: 'req-restart',
      authorizationSessionId: 'session-1',
      institutionDomain: 'example.edu',
      expiresAt: 1_900_000_000,
    }
    redisCommand.mockResolvedValueOnce(JSON.stringify(storedRecord))

    await expect(getRegisteredIntent('req-restart')).resolves.toEqual(storedRecord)
  })

  test('removes both the durable record and its index entry', async () => {
    redisCommand.mockResolvedValue('OK')

    await expect(removeRegisteredIntent('req-1')).resolves.toBe(true)

    expect(redisCommand).toHaveBeenNthCalledWith(1, [
      'DEL',
      'marketplace:intent-lifecycle:req-1',
    ])
    expect(redisCommand).toHaveBeenNthCalledWith(2, [
      'SREM',
      'marketplace:intent-lifecycle:index',
      'req-1',
    ])
  })

  test('fails closed without Redis while leaving callers with empty lifecycle state', async () => {
    hasRedisConfig.mockReturnValue(false)

    await expect(recordRegisteredIntent({ requestId: 'req-down' })).resolves.toBe(false)
    await expect(getRegisteredIntent('req-down')).resolves.toBeNull()
    await expect(listRegisteredIntentIds()).resolves.toEqual([])
    await expect(removeRegisteredIntent('req-down')).resolves.toBe(false)
    expect(redisCommand).not.toHaveBeenCalled()
  })

  test('does not revive malformed durable records after a restart', async () => {
    redisCommand.mockResolvedValue('{not-json')

    await expect(getRegisteredIntent('req-corrupt')).resolves.toBeNull()
  })
})
