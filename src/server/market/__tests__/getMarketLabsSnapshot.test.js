/**
 * @jest-environment node
 */

jest.mock('next/cache', () => ({
  unstable_cache: (callback) => callback,
}))

jest.mock('@/app/api/contract/utils/contractInstance', () => ({
  getContractInstance: jest.fn(),
}))

jest.mock('@/hooks/utils/metadataHelpers', () => ({}))

jest.mock('@/hooks/lab/labEnrichmentHelpers', () => ({
  buildEnrichedLab: jest.fn(),
  collectMetadataImages: jest.fn(() => ['https://images.example/lab.png']),
}))

jest.mock('@/utils/metadata/metadataPolicy', () => ({
  isLocalMetadataUri: jest.fn(() => true),
  loadMetadataDocument: jest.fn(),
}))

jest.mock('@/utils/metadata/providerMetadataOrigins', () => ({
  resolveProviderMetadataOrigins: jest.fn(),
}))

import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { buildEnrichedLab } from '@/hooks/lab/labEnrichmentHelpers'
import { loadMetadataDocument } from '@/utils/metadata/metadataPolicy'
import {
  getMarketLabsSnapshot,
  MARKET_CATALOGUE_STATUS,
  MARKET_SNAPSHOT_FRESHNESS_MS,
} from '../getMarketLabsSnapshot'
import { clearMarketSnapshotStoreForTests } from '../marketSnapshotStore'

describe('getMarketLabsSnapshot', () => {
  let contract

  beforeEach(() => {
    jest.clearAllMocks()
    clearMarketSnapshotStoreForTests()
    contract = {
      getLabsPaginated: jest.fn().mockResolvedValue([[7], 1]),
      getLabProviders: jest.fn().mockResolvedValue([{
        account: '0x1234567890123456789012345678901234567890',
        base: { name: 'Public Provider', email: 'private@example.edu' },
      }]),
      getLab: jest.fn().mockResolvedValue([
        7,
        ['Lab-Provider-7.json', '100000', 'https://private.example/access', 'secret-key', 123, 1],
      ]),
      ownerOf: jest.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
      isTokenListed: jest.fn().mockResolvedValue(true),
      getLabReputation: jest.fn().mockResolvedValue({ score: 4.5, totalEvents: 10 }),
    }
    getContractInstance.mockResolvedValue(contract)
    loadMetadataDocument.mockResolvedValue({
      name: 'Public Lab',
      image: 'https://images.example/lab.png',
    })
    buildEnrichedLab.mockImplementation(({ lab, metadata, isListed, reputation }) => ({
      id: lab.labId,
      name: metadata.name,
      provider: 'Public Provider',
      providerInfo: { name: 'Public Provider', email: 'private@example.edu' },
      image: metadata.image,
      price: lab.base.price,
      resourceType: lab.base.resourceType,
      isListed,
      reputation,
      uri: lab.base.uri,
      accessURI: 'https://private.example/access',
      accessKey: 'secret-key',
    }))
  })

  test('returns only the public catalogue DTO', async () => {
    const snapshot = await getMarketLabsSnapshot()

    expect(snapshot.labs).toEqual([expect.objectContaining({
      id: 7,
      name: 'Public Lab',
      provider: 'Public Provider',
    })])
    expect(snapshot.labs[0]).not.toHaveProperty('accessURI')
    expect(snapshot.labs[0]).not.toHaveProperty('accessKey')
    expect(snapshot.labs[0]).not.toHaveProperty('uri')
    expect(snapshot.labs[0]).not.toHaveProperty('providerInfo')
    expect(snapshot.labs[0]).not.toHaveProperty('email')
    expect(snapshot).toMatchObject({
      cursor: 0,
      limit: 24,
      nextCursor: null,
      totalLabs: 1,
    })
    expect(contract.getLabsPaginated).toHaveBeenCalledWith(0, 24)
  })

  test('requests the requested cursor page and exposes a next cursor', async () => {
    contract.getLabsPaginated.mockResolvedValue([[7], 50])

    const snapshot = await getMarketLabsSnapshot({ cursor: 24, limit: 12 })

    expect(contract.getLabsPaginated).toHaveBeenCalledWith(24, 12)
    expect(snapshot).toMatchObject({
      cursor: 24,
      limit: 12,
      nextCursor: '25',
      totalLabs: 50,
    })
  })

  test('does not expose a lab publicly when the listing status cannot be read', async () => {
    contract.isTokenListed.mockRejectedValue(new Error('RPC unavailable'))

    const snapshot = await getMarketLabsSnapshot()

    expect(snapshot.labs).toEqual([])
    expect(buildEnrichedLab).not.toHaveBeenCalled()
  })

  test('keeps an unreadable listing out of the listed-only view when unlisted labs are requested explicitly', async () => {
    contract.isTokenListed.mockRejectedValue(new Error('RPC unavailable'))

    const snapshot = await getMarketLabsSnapshot({ includeUnlisted: true })

    expect(snapshot.labs).toEqual([expect.objectContaining({
      id: 7,
      isListed: false,
    })])
  })

  test('reuses the persisted page snapshot instead of repeating the RPC fan-out', async () => {
    await getMarketLabsSnapshot()
    await getMarketLabsSnapshot()

    expect(contract.getLabsPaginated).toHaveBeenCalledTimes(1)
    expect(contract.getLab).toHaveBeenCalledTimes(1)
    expect(contract.ownerOf).toHaveBeenCalledTimes(1)
    expect(contract.isTokenListed).toHaveBeenCalledTimes(1)
    expect(contract.getLabReputation).toHaveBeenCalledTimes(1)
    expect(loadMetadataDocument).toHaveBeenCalledTimes(1)
  })

  test('keeps the last valid snapshot and marks it stale when revalidation fails', async () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-07-15T10:42:00.000Z'))
    const freshSnapshot = await getMarketLabsSnapshot()

    contract.getLabsPaginated.mockRejectedValue(new Error('RPC unavailable'))
    jest.advanceTimersByTime(MARKET_SNAPSHOT_FRESHNESS_MS + 1)
    const staleSnapshot = await getMarketLabsSnapshot()
    await jest.advanceTimersByTimeAsync(0)

    expect(staleSnapshot).toMatchObject({
      catalogueStatus: MARKET_CATALOGUE_STATUS.STALE,
      labs: freshSnapshot.labs,
      snapshotAt: freshSnapshot.snapshotAt,
    })
    expect(contract.getLabsPaginated).toHaveBeenCalledTimes(2)
    jest.useRealTimers()
  })

  test('reports the catalogue as unavailable instead of disguising an RPC failure as an empty catalogue', async () => {
    contract.getLabsPaginated.mockRejectedValue(new Error('RPC unavailable'))

    const snapshot = await getMarketLabsSnapshot()

    expect(snapshot).toMatchObject({
      catalogueStatus: MARKET_CATALOGUE_STATUS.UNAVAILABLE,
      labs: [],
      totalLabs: 0,
      snapshotAt: null,
    })
  })
})
