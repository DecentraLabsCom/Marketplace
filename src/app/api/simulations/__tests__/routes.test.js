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
    resolveGatewayBaseUrl: jest.fn(),
    buildGatewayTargetUrl: jest.fn(),
    extractBearerHeader: jest.fn(),
  }
})

let gatewayProxy

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

// ─── POST /api/simulations/run ──────────────────────────────────────

describe('POST /api/simulations/run', () => {
  let POST

  beforeEach(async () => {
    jest.resetModules()
    global.fetch = jest.fn()
    gatewayProxy = await import('@/utils/api/gatewayProxy')
    gatewayProxy.resolveGatewayBaseUrl.mockResolvedValue('https://gw.example.com')
    gatewayProxy.buildGatewayTargetUrl.mockImplementation(buildUrl)
    gatewayProxy.extractBearerHeader.mockReturnValue(null)
    const mod = await import('../run/route')
    POST = mod.POST
  })

  afterEach(() => {
    delete global.fetch
  })

  test('returns 400 when labId is missing', async () => {
    const request = new Request('http://localhost/api/simulations/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gatewayUrl: 'https://gw.example.com/auth' }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toMatch(/labId/i)
  })

  test('uses resolved gateway when gatewayUrl is missing', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'completed' }),
    })

    const request = new Request('http://localhost/api/simulations/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ labId: '1' }),
    })

    const response = await POST(request)
    expect(response.status).toBe(200)
    expect(gatewayProxy.resolveGatewayBaseUrl).toHaveBeenCalledWith({
      labId: '1',
      gatewayUrl: undefined,
      requireLabMatch: true,
    })
  })

  test('proxies to gateway and returns simulation results', async () => {
    const mockResult = { status: 'completed', time: [0, 0.1], outputs: { pos: [0, 1] } }
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResult,
    })

    const request = new Request('http://localhost/api/simulations/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        labId: '42',
        reservationKey: '0xabc',
        parameters: { mass: 1.5 },
        options: { startTime: 0, stopTime: 10, stepSize: 0.1 },
        gatewayUrl: 'https://gw.example.com/auth',
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.status).toBe('completed')
    expect(data.outputs.pos).toEqual([0, 1])

    // Verify correct gateway URL construction
    expect(global.fetch).toHaveBeenCalledWith(
      'https://gw.example.com/fmu/api/v1/simulations/run',
      expect.objectContaining({ method: 'POST' })
    )
  })

  test('forwards gateway error status', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => '{"detail": "Concurrency limit reached"}',
    })

    const request = new Request('http://localhost/api/simulations/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        labId: '42',
        gatewayUrl: 'https://gw.example.com/auth',
      }),
    })

    const response = await POST(request)
    expect(response.status).toBe(429)
  })

  test('returns 500 on fetch failure', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'))

    const request = new Request('http://localhost/api/simulations/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        labId: '42',
        gatewayUrl: 'https://gw.example.com/auth',
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toMatch(/Network error/)
  })

  test('does not forward browser cookies to gateway', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'completed' }),
    })
    gatewayProxy.extractBearerHeader.mockReturnValue('Bearer token-123')

    const request = new Request('http://localhost/api/simulations/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'session=abc123',
        Authorization: 'Bearer token-123',
      },
      body: JSON.stringify({
        labId: '42',
        gatewayUrl: 'https://gw.example.com/auth',
      }),
    })

    const response = await POST(request)
    expect(response.status).toBe(200)

    const [, fetchOptions] = global.fetch.mock.calls[0]
    expect(fetchOptions.headers.Authorization).toBe('Bearer token-123')
    expect(fetchOptions.headers.Cookie).toBeUndefined()
  })
})

// ─── GET /api/simulations/describe ──────────────────────────────────

describe('GET /api/simulations/describe', () => {
  let GET

  beforeEach(async () => {
    jest.resetModules()
    global.fetch = jest.fn()
    gatewayProxy = await import('@/utils/api/gatewayProxy')
    gatewayProxy.resolveGatewayBaseUrl.mockResolvedValue('https://gw.example.com')
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

  test('returns 400 when gatewayUrl is missing', async () => {
    gatewayProxy.resolveGatewayBaseUrl.mockRejectedValueOnce(
      new gatewayProxy.GatewayValidationError('Missing labId or gatewayUrl', 400)
    )
    const request = new Request(
      'http://localhost/api/simulations/describe?fmuFileName=test.fmu'
    )

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toMatch(/gatewayUrl|labId/i)
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
      'http://localhost/api/simulations/describe?fmuFileName=spring.fmu&gatewayUrl=https://gw.example.com/auth'
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
      'http://localhost/api/simulations/describe?fmuFileName=missing.fmu&gatewayUrl=https://gw.example.com/auth'
    )

    const response = await GET(request)
    expect(response.status).toBe(404)
  })

  test('returns 500 on fetch failure', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Connection refused'))

    const request = new Request(
      'http://localhost/api/simulations/describe?fmuFileName=test.fmu&gatewayUrl=https://gw.example.com/auth'
    )

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toMatch(/Connection refused/)
  })
})

// ─── POST /api/simulations/stream ───────────────────────────────────

describe('POST /api/simulations/stream', () => {
  let POST

  beforeEach(async () => {
    jest.resetModules()
    global.fetch = jest.fn()
    gatewayProxy = await import('@/utils/api/gatewayProxy')
    gatewayProxy.resolveGatewayBaseUrl.mockResolvedValue('https://gw.example.com')
    gatewayProxy.buildGatewayTargetUrl.mockImplementation(buildUrl)
    gatewayProxy.extractBearerHeader.mockReturnValue(null)
    const mod = await import('../stream/route')
    POST = mod.POST
  })

  afterEach(() => {
    delete global.fetch
  })

  test('returns 400 when labId is missing', async () => {
    const request = new Request('http://localhost/api/simulations/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gatewayUrl: 'https://gw.example.com/auth' }),
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  test('returns 200 and NDJSON content type when proxy succeeds', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: '{"type":"started"}\n',
    })

    const request = new Request('http://localhost/api/simulations/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ labId: '42', gatewayUrl: 'https://gw.example.com/auth' }),
    })

    const response = await POST(request)
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('application/x-ndjson')
  })

  test('forwards gateway error status', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'forbidden',
    })

    const request = new Request('http://localhost/api/simulations/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ labId: '42', gatewayUrl: 'https://gw.example.com/auth' }),
    })

    const response = await POST(request)
    expect(response.status).toBe(403)
  })
})

// ─── GET /api/simulations/history ────────────────────────────────────

describe('GET /api/simulations/history', () => {
  let GET

  beforeEach(async () => {
    jest.resetModules()
    global.fetch = jest.fn()
    gatewayProxy = await import('@/utils/api/gatewayProxy')
    gatewayProxy.resolveGatewayBaseUrl.mockResolvedValue('https://gw.example.com')
    gatewayProxy.buildGatewayTargetUrl.mockImplementation(buildUrl)
    gatewayProxy.extractBearerHeader.mockReturnValue(null)
    const mod = await import('../history/route')
    GET = mod.GET
  })

  afterEach(() => {
    delete global.fetch
  })

  test('returns 400 when labId is missing', async () => {
    const request = new Request(
      'http://localhost/api/simulations/history?gatewayUrl=https://gw.example.com/auth'
    )

    const response = await GET(request)
    expect(response.status).toBe(400)
  })

  test('returns 200 with simulation history', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ simulations: [{ id: 'sim-1' }] }),
    })

    const request = new Request(
      'http://localhost/api/simulations/history?labId=42&gatewayUrl=https://gw.example.com/auth'
    )

    const response = await GET(request)
    const data = await response.json()
    expect(response.status).toBe(200)
    expect(data.simulations).toHaveLength(1)
  })
})

// ─── GET /api/simulations/result ─────────────────────────────────────

describe('GET /api/simulations/result', () => {
  let GET

  beforeEach(async () => {
    jest.resetModules()
    global.fetch = jest.fn()
    gatewayProxy = await import('@/utils/api/gatewayProxy')
    gatewayProxy.resolveGatewayBaseUrl.mockResolvedValue('https://gw.example.com')
    gatewayProxy.buildGatewayTargetUrl.mockImplementation(buildUrl)
    gatewayProxy.extractBearerHeader.mockReturnValue(null)
    const mod = await import('../result/route')
    GET = mod.GET
  })

  afterEach(() => {
    delete global.fetch
  })

  test('returns 400 when simId is missing', async () => {
    const request = new Request(
      'http://localhost/api/simulations/result?labId=42&gatewayUrl=https://gw.example.com/auth'
    )

    const response = await GET(request)
    expect(response.status).toBe(400)
  })

  test('returns 400 when labId is missing', async () => {
    const request = new Request(
      'http://localhost/api/simulations/result?simId=sim-1&gatewayUrl=https://gw.example.com/auth'
    )

    const response = await GET(request)
    expect(response.status).toBe(400)
  })

  test('returns 200 with simulation result', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: { outputs: { y: [1, 2] } } }),
    })

    const request = new Request(
      'http://localhost/api/simulations/result?simId=sim-1&labId=42&gatewayUrl=https://gw.example.com/auth'
    )

    const response = await GET(request)
    const data = await response.json()
    expect(response.status).toBe(200)
    expect(data.result.outputs.y).toEqual([1, 2])
  })
})

// ─── POST /api/simulations/upload ────────────────────────────────────

describe('POST /api/simulations/upload', () => {
  let POST

  beforeEach(async () => {
    jest.resetModules()
    const mod = await import('../upload/route')
    POST = mod.POST
  })

  afterEach(() => {
    delete global.fetch
  })

  test('returns 410 because upload is disabled by architecture', async () => {
    const formData = new FormData()
    formData.append('file', new Blob(['dummy'], { type: 'application/octet-stream' }), 'test.fmu')
    formData.append('labId', '42')
    const request = new Request('http://localhost/api/simulations/upload', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    const data = await response.json()
    expect(response.status).toBe(410)
    expect(data.code).toBe('FMU_UPLOAD_DISABLED')
  })
})

// --- GET /api/simulations/proxy --------------------------------------

describe('GET /api/simulations/proxy', () => {
  let GET

  beforeEach(async () => {
    jest.resetModules()
    global.fetch = jest.fn()
    gatewayProxy = await import('@/utils/api/gatewayProxy')
    gatewayProxy.resolveGatewayBaseUrl.mockResolvedValue('https://gw.example.com')
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
    expect(response.headers.get('Content-Type')).toContain('application/octet-stream')
    expect(response.headers.get('Content-Disposition')).toContain('fmu-proxy-lab-42.fmu')
  })
})
