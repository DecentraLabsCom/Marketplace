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
          capabilities: {
            physicalLab: {
              state: 'ready',
              reason: 'station_ready',
              source: 'lab_station_heartbeat',
              severity: 'positive',
              observedAt: '2026-09-23T10:00:00Z',
              ageSeconds: 30,
            },
            fmu: {
              state: 'not_ready',
              reason: 'fmu_not_ready',
              source: 'lab_station_heartbeat',
              severity: 'critical',
              observedAt: '2026-09-23T10:00:00Z',
              ageSeconds: 30,
            },
          },
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
    expect(body.statuses[0].capabilities.fmu).toMatchObject({
      state: 'not_ready',
      reason: 'fmu_not_ready',
    })
    expect(gatewayFetch).toHaveBeenCalledWith(
      expect.stringContaining('/public/labs/status?labIds=7'),
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    )
  })

  test('preserves a reachable Guacamole target signal as distinct from station readiness', async () => {
    gatewayFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      statuses: [{
        labId: '7',
        state: 'reachable',
        reason: 'target_reachable',
        source: 'guacamole_tcp_probe',
        severity: 'positive',
        observedAt: '2026-09-23T10:00:00Z',
        ageSeconds: 4,
        generatedAt: '2026-09-23T10:00:04Z',
      }],
    }), { status: 200 }))

    const response = await GET(request('/api/market/lab-status?labIds=7'))
    const body = await response.json()

    expect(body.statuses[0]).toMatchObject({
      state: 'reachable',
      source: 'guacamole_tcp_probe',
      reason: 'target_reachable',
    })
  })

  test('preserves LABUSER occupancy as a bounded busy status', async () => {
    gatewayFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      statuses: [{
        labId: '7',
        state: 'busy',
        reason: 'lab_user_session_active',
        source: 'lab_station_heartbeat',
        severity: 'warning',
        observedAt: '2026-09-23T10:00:00Z',
        ageSeconds: 12,
        generatedAt: '2026-09-23T10:00:12Z',
      }],
    }), { status: 200 }))

    const response = await GET(request('/api/market/lab-status?labIds=7'))
    const body = await response.json()

    expect(body.statuses[0]).toMatchObject({
      state: 'busy',
      reason: 'lab_user_session_active',
      severity: 'warning',
    })
  })

  test('preserves local FMU runner readiness and its capability source', async () => {
    gatewayFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      statuses: [{
        labId: '7',
        state: 'ready',
        reason: 'fmu_ready',
        source: 'fmu_runner_health',
        severity: 'positive',
        observedAt: '2026-09-25T10:00:00Z',
        ageSeconds: 2,
        capabilities: {
          fmu: {
            state: 'ready',
            reason: 'fmu_ready',
            source: 'fmu_runner_health',
            severity: 'positive',
            observedAt: '2026-09-25T10:00:00Z',
            ageSeconds: 2,
          },
        },
      }],
    }), { status: 200 }))

    const response = await GET(request('/api/market/lab-status?labIds=7'))
    const body = await response.json()

    expect(body.statuses[0]).toMatchObject({
      state: 'ready',
      source: 'fmu_runner_health',
      reason: 'fmu_ready',
    })
    expect(body.statuses[0].capabilities.fmu).toMatchObject({
      state: 'ready',
      source: 'fmu_runner_health',
    })
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
