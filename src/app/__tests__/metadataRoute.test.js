/**
 * @jest-environment node
 */

jest.mock('@/utils/isVercel', () => ({
  __esModule: true,
  default: jest.fn(() => false),
}))

jest.mock('@/utils/metadata/metadataPolicy', () => ({
  loadOnChainLabMetadata: jest.fn(),
  MetadataFetchError: class MetadataFetchError extends Error {},
}))

import { loadOnChainLabMetadata } from '@/utils/metadata/metadataPolicy'
import { GET } from '../api/metadata/route.js'

describe('/api/metadata', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    loadOnChainLabMetadata.mockResolvedValue({
      metadataUri: 'https://provider.example/lab.json',
      metadata: { name: 'Test lab', unknown: 'must-not-leak' },
    })
  })

  test('requires labId for external metadata', async () => {
    const response = await GET(new Request(
      'https://marketplace.example/api/metadata?uri=https%3A%2F%2Fprovider.example%2Flab.json',
    ))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      code: 'MISSING_PARAMETER',
      error: 'The lab identifier is required.',
    })
    expect(loadOnChainLabMetadata).not.toHaveBeenCalled()
  })

  test('loads only the exact tokenURI resolved for the lab', async () => {
    const response = await GET(new Request(
      'https://marketplace.example/api/metadata?labId=7&uri=https%3A%2F%2Fprovider.example%2Flab.json',
    ))

    expect(response.status).toBe(200)
    expect(loadOnChainLabMetadata).toHaveBeenCalledWith('7', { cacheBuster: null })
  })

  test('rejects a URI that does not equal the on-chain tokenURI', async () => {
    const response = await GET(new Request(
      'https://marketplace.example/api/metadata?labId=7&uri=https%3A%2F%2Fevil.example%2Flab.json',
    ))

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ code: 'METADATA_URI_MISMATCH' })
  })
})
