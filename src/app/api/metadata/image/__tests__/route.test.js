/** @jest-environment node */

import { GET } from '../route'
import { institutionalBackendFetch } from '@/utils/api/gatewayProxy'
import { assertDeclaredLabResource, MetadataFetchError } from '@/utils/metadata/metadataPolicy'

const transformedImage = Buffer.from('safe-webp-bytes')
const toBuffer = jest.fn().mockResolvedValue({ data: transformedImage, info: { width: 1, height: 1 } })
const webp = jest.fn(() => ({ toBuffer }))
const rotate = jest.fn(() => ({ webp }))

jest.mock('sharp', () => jest.fn(() => ({ rotate })))

jest.mock('@/utils/metadata/metadataPolicy', () => ({
  assertDeclaredLabResource: jest.fn(),
  MetadataFetchError: class MetadataFetchError extends Error {
    constructor(message, status, code) { super(message); this.status = status; this.code = code }
  },
}))

jest.mock('@/utils/api/gatewayProxy', () => ({
  institutionalBackendFetch: jest.fn(),
}))

describe('GET /api/metadata/image', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    assertDeclaredLabResource.mockImplementation(async (_labId, uri) => uri)
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
    expect(response.headers.get('Content-Type')).toBe('image/webp')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(await response.text()).toBe('safe-webp-bytes')
    expect(rotate).toHaveBeenCalledTimes(1)
    expect(webp).toHaveBeenCalledWith({ quality: 82, effort: 4 })
  })

  test('rejects bytes that cannot be decoded as the declared image type', async () => {
    const sharp = (await import('sharp')).default
    sharp.mockImplementationOnce(() => ({
      rotate: () => ({
        webp: () => ({ toBuffer: jest.fn().mockRejectedValue(new Error('invalid image')) }),
      }),
    }))
    institutionalBackendFetch.mockResolvedValue(new Response('not an image', {
      status: 200,
      headers: { 'content-type': 'image/png' },
    }))

    const response = await GET(new Request(
      'http://localhost/api/metadata/image?labId=7&uri=https%3A%2F%2Flab.example.edu%2Fimages%2Fcover.png',
    ))

    expect(response.status).toBe(415)
    expect((await response.json()).code).toBe('INVALID_IMAGE_CONTENT')
  })

  test('rejects an image not declared in the lab metadata', async () => {
    assertDeclaredLabResource.mockRejectedValue(new MetadataFetchError('not declared', 403, 'RESOURCE_NOT_DECLARED'))
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

