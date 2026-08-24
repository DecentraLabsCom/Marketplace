/**
 * @jest-environment node
 */

jest.mock('@/app/api/contract/utils/contractInstance', () => ({
  getContractInstance: jest.fn(),
}))

jest.mock('@/utils/metadata/metadataPolicy', () => ({
  isLocalMetadataUri: jest.fn(),
  loadMetadataDocument: jest.fn(),
}))

jest.mock('@/utils/metadata/providerMetadataOrigins', () => ({
  resolveProviderMetadataOrigins: jest.fn(),
}))

import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { isLocalMetadataUri, loadMetadataDocument } from '@/utils/metadata/metadataPolicy'
import { resolveProviderMetadataOrigins } from '@/utils/metadata/providerMetadataOrigins'
import { GET } from '../route'

describe('GET /api/demo/eligibility', () => {
  let contract

  beforeEach(() => {
    jest.clearAllMocks()
    contract = {
      getLab: jest.fn().mockResolvedValue([
        42n,
        ['Lab-42.json', '100', 'https://gateway.example/guacamole', 'guac:id:7', 0n, 0n],
      ]),
      isTokenListed: jest.fn().mockResolvedValue(true),
      checkAvailable: jest.fn().mockResolvedValue(true),
    }
    getContractInstance.mockResolvedValue(contract)
    isLocalMetadataUri.mockReturnValue(true)
    loadMetadataDocument.mockResolvedValue({ demoEnabled: true })
    resolveProviderMetadataOrigins.mockResolvedValue([])
  })

  const request = (query = 'labId=42&start=200&end=800') => ({
    nextUrl: new URL(`https://market.example/api/demo/eligibility?${query}`),
  })

  test('returns eligible only when the canonical lab, listing, physical type, metadata flag and window all match', async () => {
    const response = await GET(request())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      eligible: true,
      labId: '42',
      start: '200',
      end: '800',
    })
    expect(contract.getLab).toHaveBeenCalledWith(42n)
    expect(contract.isTokenListed).toHaveBeenCalledWith(42n)
    expect(contract.checkAvailable).toHaveBeenCalledWith(42n, 200n, 800n)
    expect(loadMetadataDocument).toHaveBeenCalledWith('Lab-42.json', {
      additionalAllowedOrigins: [],
    })
  })

  test.each([
    ['unlisted', { isTokenListed: false }],
    ['FMU', { resourceType: 1n }],
    ['demo flag disabled', { metadata: { demoEnabled: false } }],
    ['window unavailable', { available: false }],
  ])('returns ineligible for a %s lab', async (_label, overrides) => {
    if (overrides.isTokenListed !== undefined) {
      contract.isTokenListed.mockResolvedValue(overrides.isTokenListed)
    }
    if (overrides.resourceType !== undefined) {
      contract.getLab.mockResolvedValue([
        42n,
        ['Lab-42.json', '100', 'https://gateway.example/guacamole', 'guac:id:7', 0n, overrides.resourceType],
      ])
    }
    if (overrides.metadata !== undefined) loadMetadataDocument.mockResolvedValue(overrides.metadata)
    if (overrides.available !== undefined) contract.checkAvailable.mockResolvedValue(overrides.available)

    const response = await GET(request())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      eligible: false,
      labId: '42',
      start: '200',
      end: '800',
    })
  })

  test('rejects malformed or oversized availability windows before touching the chain', async () => {
    const response = await GET(request('labId=42&start=200&end=801'))

    expect(response.status).toBe(400)
    expect(getContractInstance).not.toHaveBeenCalled()
  })

  test('fails closed when the authority cannot read metadata', async () => {
    loadMetadataDocument.mockRejectedValue(new Error('metadata unavailable'))

    const response = await GET(request())

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ eligible: false })
  })

  test('loads remote metadata only through provider-owned allowlisted origins', async () => {
    contract.ownerOf = jest.fn().mockResolvedValue('0x1234567890123456789012345678901234567890')
    isLocalMetadataUri.mockReturnValue(false)
    resolveProviderMetadataOrigins.mockResolvedValue(['https://provider.example'])

    const response = await GET(request())

    expect(response.status).toBe(200)
    expect(contract.ownerOf).toHaveBeenCalledWith(42n)
    expect(resolveProviderMetadataOrigins).toHaveBeenCalledWith({
      labId: 42n,
      ownerAddress: '0x1234567890123456789012345678901234567890',
      contract,
    })
    expect(loadMetadataDocument).toHaveBeenCalledWith('Lab-42.json', {
      additionalAllowedOrigins: ['https://provider.example'],
    })
  })
})
