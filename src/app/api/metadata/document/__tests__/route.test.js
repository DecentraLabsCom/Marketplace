/** @jest-environment node */

import { GET } from '../route'
import { institutionalBackendFetch } from '@/utils/api/gatewayProxy'
import { assertDeclaredLabResource } from '@/utils/metadata/metadataPolicy'
import { scanDocumentBuffer } from '@/utils/storage/documentMalwareScan'

jest.mock('@/utils/metadata/metadataPolicy', () => ({
  assertDeclaredLabResource: jest.fn(),
  MetadataFetchError: class MetadataFetchError extends Error {
    constructor(message, status, code) { super(message); this.status = status; this.code = code }
  },
}))

jest.mock('@/utils/api/gatewayProxy', () => ({
  institutionalBackendFetch: jest.fn(),
}))

jest.mock('@/utils/storage/documentMalwareScan', () => ({
  scanDocumentBuffer: jest.fn().mockResolvedValue({ scanned: true }),
  DocumentScanError: class DocumentScanError extends Error {},
}))

describe('GET /api/metadata/document', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    assertDeclaredLabResource.mockImplementation(async (_labId, uri) => uri)
  })

  test('rejects non-HTTPS document URLs before fetching', async () => {
    const response = await GET(new Request(
      'http://localhost/api/metadata/document?labId=7&uri=http%3A%2F%2Fdocs.example.edu%2Fguide.pdf',
    ))

    expect(response.status).toBe(400)
    expect(institutionalBackendFetch).not.toHaveBeenCalled()
  })

  test('serves allowlisted PDFs inline with defensive headers', async () => {
    institutionalBackendFetch.mockResolvedValue(new Response('%PDF-1.7\npdf-bytes', {
      status: 200,
      headers: { 'content-type': 'application/pdf' },
    }))

    const response = await GET(new Request(
      'http://localhost/api/metadata/document?labId=7&uri=https%3A%2F%2Fdocs.example.edu%2Fguide.pdf',
    ))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Disposition')).toBe('inline; filename="guide.pdf"')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(await response.text()).toBe('%PDF-1.7\npdf-bytes')
    expect(scanDocumentBuffer).toHaveBeenCalledWith(expect.objectContaining({
      contentType: 'application/pdf',
      filename: 'guide.pdf',
    }))
  })

  test('forces non-PDF documents to download as attachments', async () => {
    institutionalBackendFetch.mockResolvedValue(new Response('plain text document', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    }))

    const response = await GET(new Request(
      'http://localhost/api/metadata/document?labId=7&uri=https%3A%2F%2Fdocs.example.edu%2Fguide.txt',
    ))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="guide.txt"')
    expect(response.headers.get('Content-Security-Policy')).toBe("default-src 'none'; frame-ancestors 'self'")
    expect(response.headers.get('X-Frame-Options')).toBe('SAMEORIGIN')
  })

  test('rejects a PDF content type whose bytes are not a PDF', async () => {
    institutionalBackendFetch.mockResolvedValue(new Response('not a PDF', {
      status: 200,
      headers: { 'content-type': 'application/pdf' },
    }))

    const response = await GET(new Request(
      'http://localhost/api/metadata/document?labId=7&uri=https%3A%2F%2Fdocs.example.edu%2Fguide.pdf',
    ))

    expect(response.status).toBe(415)
    expect(scanDocumentBuffer).not.toHaveBeenCalled()
  })
})
