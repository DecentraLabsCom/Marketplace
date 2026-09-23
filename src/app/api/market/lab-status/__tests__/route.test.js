/**
 * @jest-environment node
 */

jest.mock('@/utils/api/gatewayProxy', () => {
  const actual = jest.requireActual('@/utils/api/gatewayProxy')
  return {
    ...actual,
    gatewayFetch: jest.fn(),
    resolveLabAccessGateways: jest.fn(),
  }
})

import { gatewayFetch, resolveLabAccessGateways } from '@/utils/api/gatewayProxy'
import { GET } from '../route'

const request = (path) => new Request(`http://marketplace.example.com${path}`)

describe('GET /api/market/lab-status', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resolveLabAccessGateways.mockResolvedValue([['7', 'https://gateway.example.com']])
    gatewayFetch.mockResolvedValue(new Response(JSON.stringify({
      statuses: [
        {
          labId: '7',
          state: 'ready',
          reason: 'station_ready',
          severity: 'positive',
          observedAt: '2026-09-23T10:00:00Z',
          ageSeconds: 30,
          generatedAt: '2026-09-23T10:00:30Z',
        },
      ],
    }), { status: 200 }))
  })

  test('returns bounded gateway status without exposing the access URI', async () => {
    const response = await GET(request('/api/market/lab-status?labIds=7'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.statuses[0]).toMatchObject({
      labId: '7',
      state: 'ready',
      ageSeconds: 30,
    })
    expect(body.statuses[0]).not.toHaveProperty('accessURI')
    expect(gatewayFetch).toHaveBeenCalledWith(
      expect.stringContaining('/public/labs/status?labIds=7'),
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    )
  })

  test('returns unknown instead of a red signal when the gateway cannot be resolved', async () => {
    resolveLabAccessGateways.mockResolvedValue([['7', null]])

    const response = await GET(request('/api/market/lab-status?labIds=7'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.statuses[0]).toMatchObject({ state: 'unknown', reason: 'gateway_unavailable' })
    expect(gatewayFetch).not.toHaveBeenCalled()
  })

  test('rejects an unbounded or malformed id list', async () => {
    const response = await GET(request('/api/market/lab-status?labIds=abc'))

    expect(response.status).toBe(400)
  })
})
