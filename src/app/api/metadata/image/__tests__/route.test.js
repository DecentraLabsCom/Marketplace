/** @jest-environment node */

import { GET } from '../route'
import { resolveProviderMetadataOrigins } from '@/utils/metadata/providerMetadataOrigins'
import { institutionalBackendFetch } from '@/utils/api/gatewayProxy'

jest.mock('@/utils/metadata/providerMetadataOrigins', () => ({
  resolveProviderMetadataOrigins: jest.fn(),
}))

jest.mock('@/utils/api/gatewayProxy', () => ({
  institutionalBackendFetch: jest.fn(),
}))

describe('GET /api/metadata/image', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resolveProviderMetadataOrigins.mockResolvedValue(['https://lab.example.edu'])
  })

  test('serves a trusted image through the Marketplace origin', async () => {
    institutionalBackendFetch.mockResolvedValue(new Response('png-bytes', {
      status: 200,
      headers: { 'content-type': 'image/png' },
    }))

    const response = await GET(new Request(
      'http://localhost/api/metadata/image?labId=7&uri=https%3A%2F%2Flab.example.edu%2Fimages%2Fcover.png',
    ))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Disposition')).toBe('inline')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(await response.text()).toBe('png-bytes')
  })

  test('rejects an image origin that is not trusted for the lab', async () => {
    const response = await GET(new Request(
      'http://localhost/api/metadata/image?labId=7&uri=https%3A%2F%2Fevil.example%2Fcover.png',
    ))

    expect(response.status).toBe(403)
    expect(institutionalBackendFetch).not.toHaveBeenCalled()
  })

  test('rejects non-image responses', async () => {
    institutionalBackendFetch.mockResolvedValue(new Response('<html>nope</html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    }))

    const response = await GET(new Request(
      'http://localhost/api/metadata/image?labId=7&uri=https%3A%2F%2Flab.example.edu%2Fimages%2Fcover.png',
    ))

    expect(response.status).toBe(415)
  })
})

