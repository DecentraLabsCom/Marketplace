/**
 * @jest-environment node
 */

jest.mock('@/utils/redis/restClient', () => ({
  hasRedisConfig: jest.fn(),
  redisCommand: jest.fn(),
}))

import { hasRedisConfig, redisCommand } from '@/utils/redis/restClient'
import {
  clearMarketSnapshotStoreForTests,
  readMarketSnapshot,
  revalidateMarketSnapshot,
  writeMarketSnapshot,
} from '../marketSnapshotStore'

const page = { includeUnlisted: false, cursor: 0, limit: 24 }
const snapshot = {
  labs: [{ id: 7, name: 'Public Lab' }],
  totalLabs: 1,
  returnedLabs: 1,
  cursor: 0,
  limit: 24,
  nextCursor: null,
  snapshotAt: '2026-07-15T10:42:00.000Z',
}

describe('market snapshot store', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    clearMarketSnapshotStoreForTests()
    hasRedisConfig.mockReturnValue(true)
  })

  test('persists and restores only a valid last-known-good snapshot through Redis', async () => {
    redisCommand.mockResolvedValueOnce('OK')

    await writeMarketSnapshot(page, snapshot)

    expect(redisCommand).toHaveBeenCalledWith([
      'SET',
      'marketplace:market-snapshot:v1:listed:0:24',
      JSON.stringify(snapshot),
      'EX',
      '86400',
    ])

    clearMarketSnapshotStoreForTests()
    redisCommand.mockResolvedValueOnce(JSON.stringify(snapshot))

    await expect(readMarketSnapshot(page)).resolves.toEqual(snapshot)
  })

  test('uses a Redis NX lock so independent instances do not rebuild the same page', async () => {
    redisCommand.mockResolvedValueOnce('OK')
    const loader = jest.fn().mockResolvedValue(snapshot)

    await expect(revalidateMarketSnapshot(page, loader)).resolves.toEqual(snapshot)

    expect(redisCommand).toHaveBeenCalledWith([
      'SET',
      'marketplace:market-snapshot-refresh:v1:marketplace:market-snapshot:v1:listed:0:24',
      '1',
      'NX',
      'EX',
      '90',
    ])
    expect(loader).toHaveBeenCalledTimes(1)
  })

  test('does not run a second loader while another instance owns the Redis refresh lock', async () => {
    redisCommand.mockResolvedValueOnce(null)
    const loader = jest.fn()

    await expect(revalidateMarketSnapshot(page, loader)).rejects.toMatchObject({
      code: 'MARKET_SNAPSHOT_REVALIDATING',
    })
    expect(loader).not.toHaveBeenCalled()
  })
})
