/**
 * @jest-environment node
 */

import { createHash } from 'node:crypto'
import { clearRateLimitStoresForTests } from '@/utils/api/rateLimit'
import { gatewayFetch, resolveLabAccessGateway } from '@/utils/api/gatewayProxy'
import { GET, HEAD } from '../[labId]/[digest]/route'

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
const request = () => new Request('https://marketplace.example.test/api/aas/digital-twin-scene', {
  headers: { 'x-real-ip': '203.0.113.42' },
})

beforeEach(() => {
  jest.clearAllMocks()
  clearRateLimitStoresForTests()
  resolveLabAccessGateway.mockResolvedValue(GATEWAY_ORIGIN)
})

describe('GET /api/aas/digital-twin-scene/[labId]/[digest].glb', () => {
  test('proxies only the lab managed scene and verifies its content hash', async () => {
    const scene = Buffer.from('public managed GLB scene')
    const digest = createHash('sha256').update(scene).digest('hex')
    gatewayFetch.mockResolvedValueOnce(new Response(scene))

    const response = await GET(request(), {
      params: Promise.resolve({ labId: LAB_ID, digest }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('model/gltf-binary')
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(Buffer.from(await response.arrayBuffer())).toEqual(scene)
    expect(resolveLabAccessGateway).toHaveBeenCalledWith({ labId: LAB_ID })
    expect(gatewayFetch).toHaveBeenCalledWith(
      `${GATEWAY_ORIGIN}/digital-twin-scenes/${LAB_ID}/${digest}.glb`,
      { method: 'GET', cache: 'no-store' },
    )
  })

  test('rejects malformed IDs before contacting the provider Gateway', async () => {
    const response = await GET(request(), {
      params: Promise.resolve({ labId: '../42', digest: 'bad' }),
    })

    expect(response.status).toBe(404)
    expect(resolveLabAccessGateway).not.toHaveBeenCalled()
    expect(gatewayFetch).not.toHaveBeenCalled()
  })

  test('does not serve content that does not match its immutable path digest', async () => {
    const digest = 'a'.repeat(64)
    gatewayFetch.mockResolvedValueOnce(new Response('different scene'))

    const response = await GET(request(), {
      params: Promise.resolve({ labId: LAB_ID, digest }),
    })

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({ error: 'Digital twin scene integrity check failed' })
  })

  test('returns headers without downloading the scene for HEAD', async () => {
    gatewayFetch.mockResolvedValueOnce(new Response(null, { status: 200 }))

    const response = await HEAD(request(), {
      params: Promise.resolve({ labId: LAB_ID, digest: 'b'.repeat(64) }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('model/gltf-binary')
    expect(await response.text()).toBe('')
    expect(gatewayFetch).toHaveBeenCalledWith(
      `${GATEWAY_ORIGIN}/digital-twin-scenes/${LAB_ID}/${'b'.repeat(64)}.glb`,
      { method: 'HEAD', cache: 'no-store' },
    )
  })
})
