/**
 * @jest-environment node
 */

jest.mock('@/utils/redis/restClient', () => ({
  hasRedisConfig: jest.fn(),
  redisCommand: jest.fn(),
}))

import { hasRedisConfig, redisCommand } from '@/utils/redis/restClient'
import {
  listMetadataOriginExceptions,
  removeMetadataOriginException,
  setMetadataOriginException,
} from '../metadataOriginExceptions'

describe('metadata origin exceptions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    hasRedisConfig.mockReturnValue(true)
  })

  test('stores a reviewed exact HTTPS origin with its owner and reason', async () => {
    redisCommand
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('OK')
      .mockResolvedValueOnce(1)

    const exception = await setMetadataOriginException({
      origin: 'https://research-cdn.example.edu/',
      owner: 'Research infrastructure team',
      reason: 'Shared metadata CDN for the pilot',
      updatedBy: 'admin@example.edu',
    })

    expect(exception).toMatchObject({
      origin: 'https://research-cdn.example.edu',
      owner: 'Research infrastructure team',
      reason: 'Shared metadata CDN for the pilot',
      createdBy: 'admin@example.edu',
    })
    expect(redisCommand.mock.calls[1][0]).toEqual([
      'SET',
      expect.stringMatching(/^metadata:origin-exception:[a-f0-9]{64}$/),
      expect.stringContaining('"owner":"Research infrastructure team"'),
    ])
    expect(redisCommand.mock.calls[2][0]).toEqual([
      'ZADD',
      'metadata:origin-exceptions',
      expect.any(String),
      'https://research-cdn.example.edu',
    ])
  })

  test('rejects a path, credentials, or non-HTTPS scheme instead of treating it as an origin', async () => {
    await expect(setMetadataOriginException({
      origin: 'https://research-cdn.example.edu/metadata',
      owner: 'Research infrastructure team',
      reason: 'Shared metadata CDN for the pilot',
      updatedBy: 'admin@example.edu',
    })).rejects.toThrow(/exact HTTPS origin/i)

    await expect(setMetadataOriginException({
      origin: 'http://research-cdn.example.edu',
      owner: 'Research infrastructure team',
      reason: 'Shared metadata CDN for the pilot',
      updatedBy: 'admin@example.edu',
    })).rejects.toThrow(/exact HTTPS origin/i)
    expect(redisCommand).not.toHaveBeenCalled()
  })

  test('removes expired index entries and allows an administrator to revoke an exception immediately', async () => {
    redisCommand
      .mockResolvedValueOnce(['https://expired.example.edu'])
      .mockResolvedValueOnce(JSON.stringify({
        origin: 'https://expired.example.edu',
        expiresAt: '2020-01-01T00:00:00.000Z',
      }))
      .mockResolvedValueOnce(1)

    await expect(listMetadataOriginExceptions()).resolves.toEqual([])
    expect(redisCommand.mock.calls[2][0]).toEqual([
      'ZREM',
      'metadata:origin-exceptions',
      'https://expired.example.edu',
    ])

    redisCommand.mockReset()
    redisCommand.mockResolvedValue(1)
    await removeMetadataOriginException('https://expired.example.edu')
    expect(redisCommand).toHaveBeenNthCalledWith(1, [
      'DEL', expect.stringMatching(/^metadata:origin-exception:[a-f0-9]{64}$/),
    ])
    expect(redisCommand).toHaveBeenNthCalledWith(2, [
      'ZREM', 'metadata:origin-exceptions', 'https://expired.example.edu',
    ])
  })
})
