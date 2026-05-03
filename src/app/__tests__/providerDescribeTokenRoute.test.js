/**
 * @jest-environment node
 */

// ── Rate limiter mock (module-level initialisation) ──────────────────────────
const mockCheckRate = jest.fn(() => ({ limited: false, remaining: 29 }))

jest.mock('@/utils/api/rateLimit', () => ({
  createRateLimiter: jest.fn(() => mockCheckRate),
}))

// ── Auth guards ───────────────────────────────────────────────────────────────
const mockRequireAuth = jest.fn()
const mockRequireProviderRole = jest.fn()
const mockHandleGuardError = jest.fn((error) =>
  Response.json({ error: error.message, code: error.code }, { status: error.status })
)

class HttpError extends Error {
  constructor(message, status = 500, code = 'HTTP_ERROR') {
    super(message)
    this.status = status
    this.code = code
  }
}

class UnauthorizedError extends HttpError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED')
  }
}

class ForbiddenError extends HttpError {
  constructor(message = 'Forbidden', code = 'FORBIDDEN') {
    super(message, 403, code)
  }
}

jest.mock('@/utils/auth/guards', () => ({
  requireAuth: (...args) => mockRequireAuth(...args),
  requireProviderRole: (...args) => mockRequireProviderRole(...args),
  handleGuardError: (...args) => mockHandleGuardError(...args),
  HttpError,
  UnauthorizedError,
  ForbiddenError,
}))

// ── Marketplace JWT service ────────────────────────────────────────────────────
jest.mock('@/utils/auth/marketplaceJwt', () => ({
  __esModule: true,
  default: {
    isConfigured: jest.fn(),
    generateSamlAuthToken: jest.fn(),
  },
}))

// ── Gateway proxy utils ───────────────────────────────────────────────────────
const mockNormalizeGatewayBaseUrl = jest.fn()

class GatewayValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'GatewayValidationError'
  }
}

jest.mock('@/utils/api/gatewayProxy', () => ({
  normalizeGatewayBaseUrl: (...args) => mockNormalizeGatewayBaseUrl(...args),
  GatewayValidationError,
}))

// ── Next.js server ────────────────────────────────────────────────────────────
jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body, options = {}) => Response.json(body, options)),
  },
}))

// ── Logger ────────────────────────────────────────────────────────────────────
jest.mock('@/utils/dev/logger', () => ({
  __esModule: true,
  default: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

// ── Test helpers ──────────────────────────────────────────────────────────────
import marketplaceJwtService from '@/utils/auth/marketplaceJwt'

const SESSION = { id: 'user-1', affiliation: 'uned.es' }
const VALID_GATEWAY = 'https://sarlab.dia.uned.es'
const VALID_FMU = 'BouncingBall.fmu'

function buildRequest(params = {}) {
  const search = new URLSearchParams(params).toString()
  return new Request(`http://localhost/api/fmu/provider-describe-token?${search}`)
}

// ─────────────────────────────────────────────────────────────────────────────

describe('/api/fmu/provider-describe-token route', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    jest.clearAllMocks()
    mockCheckRate.mockReturnValue({ limited: false, remaining: 29 })
    mockRequireAuth.mockResolvedValue(SESSION)
    mockRequireProviderRole.mockReturnValue(undefined) // no-op: provider is authorised
    mockNormalizeGatewayBaseUrl.mockReturnValue(VALID_GATEWAY)
    marketplaceJwtService.isConfigured.mockResolvedValue(true)
    marketplaceJwtService.generateSamlAuthToken.mockResolvedValue('marketplace.jwt.token')
    global.fetch = jest.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  // ── Rate limiting ───────────────────────────────────────────────────────────

  test('returns 429 when rate limit is exceeded', async () => {
    mockCheckRate.mockReturnValue({ limited: true, remaining: 0 })

    const { GET } = await import('../api/fmu/provider-describe-token/route.js')

    const res = await GET(buildRequest({ fmuFileName: VALID_FMU, gatewayUrl: VALID_GATEWAY }))

    expect(res.status).toBe(429)
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringContaining('many') })
  })

  // ── Auth guard ──────────────────────────────────────────────────────────────

  test('returns 401 when user is not authenticated', async () => {
    mockRequireAuth.mockRejectedValue(new UnauthorizedError('Not authenticated'))

    const { GET } = await import('../api/fmu/provider-describe-token/route.js')

    const res = await GET(buildRequest({ fmuFileName: VALID_FMU, gatewayUrl: VALID_GATEWAY }))

    expect(res.status).toBe(401)
    expect(mockHandleGuardError).toHaveBeenCalled()
  })

  test('returns 403 when user does not have provider role', async () => {
    mockRequireProviderRole.mockImplementation(() => {
      throw new ForbiddenError('Provider role required', 'PROVIDER_ROLE_REQUIRED')
    })

    const { GET } = await import('../api/fmu/provider-describe-token/route.js')

    const res = await GET(buildRequest({ fmuFileName: VALID_FMU, gatewayUrl: VALID_GATEWAY }))

    expect(res.status).toBe(403)
    expect(mockHandleGuardError).toHaveBeenCalled()
  })

  // ── Parameter validation ────────────────────────────────────────────────────

  test('returns 400 when fmuFileName is missing', async () => {
    const { GET } = await import('../api/fmu/provider-describe-token/route.js')

    const res = await GET(buildRequest({ gatewayUrl: VALID_GATEWAY }))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringContaining('fmuFileName') })
  })

  test('returns 400 when gatewayUrl is missing', async () => {
    const { GET } = await import('../api/fmu/provider-describe-token/route.js')

    const res = await GET(buildRequest({ fmuFileName: VALID_FMU }))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringContaining('gatewayUrl') })
  })

  test('returns 400 when gatewayUrl fails SSRF validation', async () => {
    mockNormalizeGatewayBaseUrl.mockImplementation(() => {
      throw new GatewayValidationError('Gateway host is not allowed')
    })

    const { GET } = await import('../api/fmu/provider-describe-token/route.js')

    const res = await GET(buildRequest({ fmuFileName: VALID_FMU, gatewayUrl: 'https://evil.internal' }))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: 'Gateway host is not allowed' })
  })

  // ── Service dependencies ────────────────────────────────────────────────────

  test('returns 503 when marketplace JWT is not configured', async () => {
    marketplaceJwtService.isConfigured.mockResolvedValue(false)

    const { GET } = await import('../api/fmu/provider-describe-token/route.js')

    const res = await GET(buildRequest({ fmuFileName: VALID_FMU, gatewayUrl: VALID_GATEWAY }))

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringContaining('configured') })
  })

  test('returns 401 when session has no userId', async () => {
    mockRequireAuth.mockResolvedValue({ affiliation: 'uned.es' }) // no id field

    const { GET } = await import('../api/fmu/provider-describe-token/route.js')

    const res = await GET(buildRequest({ fmuFileName: VALID_FMU, gatewayUrl: VALID_GATEWAY }))

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringContaining('identity') })
  })

  // ── Gateway relay ───────────────────────────────────────────────────────────

  test('relays non-OK status from gateway auth service', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: 'invalid_marketplace_token' }),
    })

    const { GET } = await import('../api/fmu/provider-describe-token/route.js')

    const res = await GET(buildRequest({ fmuFileName: VALID_FMU, gatewayUrl: VALID_GATEWAY }))

    expect(res.status).toBe(401)
  })

  // ── Success path ────────────────────────────────────────────────────────────

  test('returns token and expiresIn on success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ token: 'signed.gateway.jwt', expiresIn: 60 }),
    })

    const { GET } = await import('../api/fmu/provider-describe-token/route.js')

    const res = await GET(buildRequest({ fmuFileName: VALID_FMU, gatewayUrl: VALID_GATEWAY }))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      token: 'signed.gateway.jwt',
      expiresIn: 60,
    })
  })

  test('calls gateway with marketplace JWT as Authorization header', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ token: 'gw.token', expiresIn: 60 }),
    })

    const { GET } = await import('../api/fmu/provider-describe-token/route.js')

    await GET(buildRequest({ fmuFileName: VALID_FMU, gatewayUrl: VALID_GATEWAY }))

    const [_url, fetchOpts] = global.fetch.mock.calls[0]
    expect(fetchOpts.headers.Authorization).toBe('Bearer marketplace.jwt.token')
    expect(fetchOpts.method).toBe('POST')
  })

  test('calls gateway with fmuFileName in request body', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ token: 'gw.token', expiresIn: 60 }),
    })

    const { GET } = await import('../api/fmu/provider-describe-token/route.js')

    await GET(buildRequest({ fmuFileName: VALID_FMU, gatewayUrl: VALID_GATEWAY }))

    const [_url, fetchOpts] = global.fetch.mock.calls[0]
    const body = JSON.parse(fetchOpts.body)
    expect(body.fmuFileName).toBe(VALID_FMU)
  })
})
