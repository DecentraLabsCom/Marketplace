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

describe('GET /api/metadata/document', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resolveProviderMetadataOrigins.mockResolvedValue(['https://docs.example.edu'])
  })

  test('rejects non-HTTPS document URLs before fetching', async () => {
    const response = await GET(new Request(
      'http://localhost/api/metadata/document?labId=7&uri=http%3A%2F%2Fdocs.example.edu%2Fguide.pdf',
    ))

    expect(response.status).toBe(400)
    expect(institutionalBackendFetch).not.toHaveBeenCalled()
  })

  test('serves allowlisted PDFs inline with defensive headers', async () => {
    institutionalBackendFetch.mockResolvedValue(new Response('pdf-bytes', {
      status: 200,
      headers: { 'content-type': 'application/pdf' },
    }))

    const response = await GET(new Request(
      'http://localhost/api/metadata/document?labId=7&uri=https%3A%2F%2Fdocs.example.edu%2Fguide.pdf',
    ))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Disposition')).toBe('inline; filename="guide.pdf"')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(await response.text()).toBe('pdf-bytes')
  })

  test('forces non-PDF documents to download as attachments', async () => {
    institutionalBackendFetch.mockResolvedValue(new Response('<html>untrusted</html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    }))

    const response = await GET(new Request(
      'http://localhost/api/metadata/document?labId=7&uri=https%3A%2F%2Fdocs.example.edu%2Fguide.html',
    ))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="guide.html"')
    expect(response.headers.get('Content-Security-Policy')).toBe("default-src 'none'; sandbox")
  })
})
