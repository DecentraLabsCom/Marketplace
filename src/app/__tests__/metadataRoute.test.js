/**
 * @jest-environment node
 */

jest.mock('@/utils/isVercel', () => ({
  __esModule: true,
  default: jest.fn(() => false),
}))

jest.mock('@/utils/metadata/metadataPolicy', () => ({
  isLocalMetadataUri: jest.fn((uri) => uri.startsWith('Lab-')),
  loadMetadataDocument: jest.fn(),
  MetadataFetchError: class MetadataFetchError extends Error {},
}))

jest.mock('@/utils/metadata/providerMetadataOrigins', () => ({
  resolveProviderMetadataOrigins: jest.fn(),
}))

import { loadMetadataDocument } from '@/utils/metadata/metadataPolicy'
import { resolveProviderMetadataOrigins } from '@/utils/metadata/providerMetadataOrigins'
import { GET } from '../api/metadata/route.js'

describe('/api/metadata', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    loadMetadataDocument.mockResolvedValue({ name: 'Test lab' })
    resolveProviderMetadataOrigins.mockResolvedValue(['https://provider.example'])
  })

  test('requires labId for external metadata', async () => {
    const response = await GET(new Request(
      'https://marketplace.example/api/metadata?uri=https%3A%2F%2Fprovider.example%2Flab.json',
    ))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      code: 'MISSING_PARAMETER',
      error: 'The lab identifier is required for external metadata.',
    })
    expect(loadMetadataDocument).not.toHaveBeenCalled()
  })

  test('passes provider origins resolved from the lab owner to metadata loading', async () => {
    const response = await GET(new Request(
      'https://marketplace.example/api/metadata?labId=7&uri=https%3A%2F%2Fprovider.example%2Flab.json',
    ))

    expect(response.status).toBe(200)
    expect(resolveProviderMetadataOrigins).toHaveBeenCalledWith({ labId: '7' })
    expect(loadMetadataDocument).toHaveBeenCalledWith(
      'https://provider.example/lab.json',
      expect.objectContaining({
        additionalAllowedOrigins: ['https://provider.example'],
      }),
    )
  })

  test('keeps local metadata available without a lab id', async () => {
    const response = await GET(new Request(
      'https://marketplace.example/api/metadata?uri=Lab-7.json',
    ))

    expect(response.status).toBe(200)
    expect(resolveProviderMetadataOrigins).not.toHaveBeenCalled()
    expect(loadMetadataDocument).toHaveBeenCalledWith(
      'Lab-7.json',
      expect.any(Object),
    )
  })
})
