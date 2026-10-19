/**
 * @jest-environment node
 */

import { clearRateLimitStoresForTests } from '@/utils/api/rateLimit'
import { gatewayFetch, resolveLabAccessGateway } from '@/utils/api/gatewayProxy'
import { GET, HEAD } from '../[labId]/[digest]/[...assetPath]/route'

jest.mock('@/utils/api/gatewayProxy', () => {
  const actual = jest.requireActual('@/utils/api/gatewayProxy')
  return {
    ...actual,
    gatewayFetch: jest.fn(),
    resolveLabAccessGateway: jest.fn(),
  }
})

const GATEWAY_ORIGIN = 'https://gateway.example.test'
const LAB_ID = '42'
const DIGEST = 'a'.repeat(64)
const request = () => new Request('https://marketplace.example.test/api/aas/digital-twin-app', {
  headers: { 'x-real-ip': '203.0.113.43' },
})

beforeEach(() => {
  jest.clearAllMocks()
  clearRateLimitStoresForTests()
  resolveLabAccessGateway.mockResolvedValue(GATEWAY_ORIGIN)
})

describe('GET /api/aas/digital-twin-app/[labId]/[digest]/[...assetPath]', () => {
  test('proxies the provider entry page same-origin with an isolated document policy', async () => {
    const html = '<!doctype html><html><body>Provider viewer</body></html>'
    gatewayFetch.mockResolvedValueOnce(new Response(html))

    const response = await GET(request(), {
      params: Promise.resolve({ labId: LAB_ID, digest: DIGEST, assetPath: ['index.html'] }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN')
    expect(response.headers.get('content-security-policy')).toContain('sandbox allow-scripts')
    expect(response.headers.get('content-security-policy')).toContain("connect-src 'self'")
    expect(await response.text()).toBe(html)
    expect(gatewayFetch).toHaveBeenCalledWith(
      `${GATEWAY_ORIGIN}/digital-twin-apps/${LAB_ID}/${DIGEST}/index.html`,
      { method: 'GET', cache: 'no-store' },
    )
  })

  test('serves only supported nested static files with their expected MIME', async () => {
    gatewayFetch.mockResolvedValueOnce(new Response('export default true'))

    const response = await GET(request(), {
      params: Promise.resolve({ labId: LAB_ID, digest: DIGEST, assetPath: ['vendor', 'three.core.js'] }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
    expect(gatewayFetch).toHaveBeenCalledWith(
      `${GATEWAY_ORIGIN}/digital-twin-apps/${LAB_ID}/${DIGEST}/vendor/three.core.js`,
      { method: 'GET', cache: 'no-store' },
    )
  })

  test.each([
    ['path traversal', ['..', 'secret.js']],
    ['unsupported executable', ['runner.exe']],
  ])('rejects %s before contacting the provider Gateway', async (_name, assetPath) => {
    const response = await GET(request(), {
      params: Promise.resolve({ labId: LAB_ID, digest: DIGEST, assetPath }),
    })

    expect(response.status).toBe(404)
    expect(resolveLabAccessGateway).not.toHaveBeenCalled()
    expect(gatewayFetch).not.toHaveBeenCalled()
  })

  test('supports HEAD without returning a provider asset body', async () => {
    gatewayFetch.mockResolvedValueOnce(new Response(null, { status: 200 }))

    const response = await HEAD(request(), {
      params: Promise.resolve({ labId: LAB_ID, digest: DIGEST, assetPath: ['index.html'] }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(await response.text()).toBe('')
  })

  test('allows all assets in a valid 300-file application to load within the rate limit', async () => {
    gatewayFetch.mockImplementation(async () => new Response('asset'))

    const responses = await Promise.all(
      Array.from({ length: 300 }, (_, index) => GET(request(), {
        params: Promise.resolve({
          labId: LAB_ID,
          digest: DIGEST,
          assetPath: [`asset-${index}.js`],
        }),
      })),
    )

    expect(responses.every((response) => response.status === 200)).toBe(true)
    expect(gatewayFetch).toHaveBeenCalledTimes(300)
  })
})
