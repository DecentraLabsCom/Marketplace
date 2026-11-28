/**
 * @jest-environment node
 */
/**
 * Tests for simulation API routes (proxy to Lab Gateway FMU runner).
 */

// ─── Mocks ──────────────────────────────────────────────────────────

jest.mock('@/utils/dev/logger', () => ({
  log: jest.fn(),
  error: jest.fn(),
}))
jest.mock('@/utils/auth/guards', () => {
  const actual = jest.requireActual('@/utils/auth/guards')
  return { ...actual, requireAuth: jest.fn(), getOptionalSession: jest.fn() }
})
jest.mock('@/utils/api/gatewayProxy', () => {
  class MockGatewayValidationError extends Error {
    constructor(message, status = 400) {
      super(message)
      this.name = 'GatewayValidationError'
      this.status = status
    }
  }
  return {
    GatewayValidationError: MockGatewayValidationError,
    resolveLabAccessGateway: jest.fn(),
    buildGatewayTargetUrl: jest.fn(),
    extractBearerHeader: jest.fn(),
    gatewayFetch: jest.fn((...args) => fetch(...args)),
  }
})

import { FMU_CONTEXT_COOKIE, createFmuUserBinding, encodeFmuContexts } from '@/utils/auth/fmuSessionStore'

let gatewayProxy
let authGuards

async function setupAuthenticatedUser() {
  authGuards = await import('@/utils/auth/guards')
  authGuards.requireAuth.mockResolvedValue({ id: 'user-1' })
  authGuards.getOptionalSession.mockResolvedValue(null)
}

function buildUrl(base, routePath, query = null) {
  const url = new URL(`${base}${routePath}`)
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return
      url.searchParams.set(key, String(value))
    })
  }
  return url.toString()
}

// ─── GET /api/simulations/describe ──────────────────────────────────

describe('GET /api/simulations/describe', () => {
  let GET

  beforeEach(async () => {
    jest.resetModules()
    global.fetch = jest.fn()
    gatewayProxy = await import('@/utils/api/gatewayProxy')
    gatewayProxy.resolveLabAccessGateway.mockResolvedValue('https://gw.example.com')
    gatewayProxy.buildGatewayTargetUrl.mockImplementation(buildUrl)
    gatewayProxy.extractBearerHeader.mockReturnValue(null)
    const mod = await import('../describe/route')
    GET = mod.GET
  })

  afterEach(() => {
    delete global.fetch
  })

  test('returns 400 when fmuFileName is missing', async () => {
    const request = new Request(
      'http://localhost/api/simulations/describe?gatewayUrl=https://gw.example.com/auth'
    )

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toMatch(/fmuFileName/i)
  })

  test('returns 400 when labId is missing', async () => {
    const request = new Request(
      'http://localhost/api/simulations/describe?fmuFileName=test.fmu'
    )

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toMatch(/labId/i)
  })

  test('proxies to gateway and returns model description', async () => {
    const mockDescription = {
      fmiVersion: '2.0',
      simulationType: 'CoSimulation',
      modelVariables: [{ name: 'mass', causality: 'input', type: 'Real' }],
    }
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockDescription,
    })

    const request = new Request(
      'http://localhost/api/simulations/describe?fmuFileName=spring.fmu&labId=42'
    )

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.fmiVersion).toBe('2.0')
    expect(data.modelVariables).toHaveLength(1)

    // Verify correct gateway URL construction
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('https://gw.example.com/fmu/api/v1/simulations/describe'),
      expect.anything()
    )
    // Verify fmuFileName is encoded in query
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('fmuFileName=spring.fmu'),
      expect.anything()
    )
  })

  test('forwards gateway error status', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => '{"detail": "FMU not found"}',
    })

    const request = new Request(
      'http://localhost/api/simulations/describe?fmuFileName=missing.fmu&labId=42'
    )

    const response = await GET(request)
    expect(response.status).toBe(404)
  })

  test('returns 500 on fetch failure', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Connection refused'))

    const request = new Request(
      'http://localhost/api/simulations/describe?fmuFileName=test.fmu&labId=42'
    )

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toBe('The simulation model could not be described.')
    expect(data).not.toHaveProperty('details')
  })
})

// --- GET /api/simulations/proxy --------------------------------------

describe('GET /api/simulations/proxy', () => {
  let GET

  beforeEach(async () => {
    jest.resetModules()
    global.fetch = jest.fn()
    await setupAuthenticatedUser()
    gatewayProxy = await import('@/utils/api/gatewayProxy')
    gatewayProxy.resolveLabAccessGateway.mockResolvedValue('https://gw.example.com')
    gatewayProxy.buildGatewayTargetUrl.mockImplementation(buildUrl)
    gatewayProxy.extractBearerHeader.mockReturnValue(null)
    const mod = await import('../proxy/route')
    GET = mod.GET
  })

  afterEach(() => {
    delete global.fetch
  })

  test('returns 400 when labId is missing', async () => {
    const request = new Request(
      'http://localhost/api/simulations/proxy?reservationKey=0xabc&gatewayUrl=https://gw.example.com/auth'
    )
    const response = await GET(request)
    expect(response.status).toBe(400)
  })

  test('returns 400 when reservationKey is missing', async () => {
    const request = new Request(
      'http://localhost/api/simulations/proxy?labId=42&gatewayUrl=https://gw.example.com/auth'
    )
    const response = await GET(request)
    expect(response.status).toBe(400)
  })

  test('proxies binary response from gateway', async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('proxy-bytes'))
        controller.close()
      },
    })
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body,
      headers: new Headers({
        'content-type': 'application/octet-stream',
        'content-disposition': 'attachment; filename="fmu-proxy-lab-42.fmu"',
      }),
    })
    gatewayProxy.extractBearerHeader.mockReturnValue('Bearer booking-token')

    const request = new Request(
      'http://localhost/api/simulations/proxy?labId=42&reservationKey=0xabc&gatewayUrl=https://gw.example.com/auth',
      { headers: { Authorization: 'Bearer booking-token' } }
    )

    const response = await GET(request)
    expect(response.status).toBe(200)
    expect(authGuards.requireAuth).not.toHaveBeenCalled()
    expect(response.headers.get('Content-Type')).toContain('application/octet-stream')
    expect(response.headers.get('Content-Disposition')).toContain('fmu-proxy-lab-42.fmu')
  })

  test('rejects a browser download without a reservation capability', async () => {
    const response = await GET(new Request(
      'http://localhost/api/simulations/proxy?labId=42&reservationKey=0xabc',
    ))

    expect(response.status).toBe(401)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  test('authorizes the proxy download with its encrypted capability after SSO expiry', async () => {
    global.fetch.mockResolvedValue(new Response('proxy-bytes'))
    authGuards.requireAuth.mockRejectedValueOnce(new authGuards.UnauthorizedError('expired'))
    const { encoded } = encodeFmuContexts([], {
      labId: '42',
      reservationKey: '0xabc',
      gatewayOrigin: 'https://gw.example.com',
      resourceSessionId: 'session_identifier_aaaaaaaa',
      expiresAt: Math.floor(Date.now() / 1000) + 300,
      userBinding: 'A'.repeat(43),
    })

    const response = await GET(new Request(
      'http://localhost/api/simulations/proxy?labId=42&reservationKey=0xabc',
      { headers: { Cookie: `${FMU_CONTEXT_COOKIE}=${encoded}` } },
    ))

    expect(response.status).toBe(200)
    expect(authGuards.requireAuth).not.toHaveBeenCalled()
    expect(global.fetch.mock.calls[0][1].headers.Cookie).toBe('FMU_SESSION=session_identifier_aaaaaaaa')
  })

  test('rejects a proxy capability issued to a different Marketplace user', async () => {
    authGuards.getOptionalSession.mockResolvedValueOnce({ id: 'user-2' })
    const { encoded } = encodeFmuContexts([], {
      labId: '42',
      reservationKey: '0xabc',
      gatewayOrigin: 'https://gw.example.com',
      resourceSessionId: 'session_identifier_aaaaaaaa',
      expiresAt: Math.floor(Date.now() / 1000) + 300,
      userBinding: createFmuUserBinding({ id: 'user-1' }),
    })

    const response = await GET(new Request(
      'http://localhost/api/simulations/proxy?labId=42&reservationKey=0xabc',
      { headers: { Cookie: `${FMU_CONTEXT_COOKIE}=${encoded}` } },
    ))

    expect(response.status).toBe(401)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
