/**
 * Tests for GET /api/backend/intents/authorize/status/[sessionId]
 */
import { GET } from '../route'
import { resolveBackendUrl, resolveForwardHeaders } from '@/utils/api/backendProxyHelpers'

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data, init) => ({ status: init?.status ?? 200, body: data })),
  },
}))

jest.mock('@/utils/dev/logger', () => ({
  error: jest.fn(),
  info: jest.fn(),
}))

jest.mock('@/utils/api/backendProxyHelpers', () => ({
  resolveBackendUrl: jest.fn(),
  resolveForwardHeaders: jest.fn(),
}))

describe('GET /api/backend/intents/authorize/status/[sessionId]', () => {
  const mockFetch = jest.fn()

  beforeAll(() => {
    global.fetch = mockFetch
  })

  afterAll(() => {
    delete global.fetch
  })

  beforeEach(() => {
    jest.clearAllMocks()
    resolveBackendUrl.mockReturnValue('http://test-backend.com')
    resolveForwardHeaders.mockResolvedValue({ 'x-forwarded-for': '127.0.0.1' })
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ authorized: true })
    })
  })

  function makeRequest(searchParams = {}) {
    return {
      nextUrl: {
        searchParams: new URLSearchParams(searchParams),
      },
    }
  }

  it('returns 400 when backendUrl is missing', async () => {
    resolveBackendUrl.mockReturnValue(null)
    const res = await GET(makeRequest(), { params: { sessionId: '123' } })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Missing institutional backend URL/)
  })

  it('returns 400 when sessionId is globally missing', async () => {
    const res = await GET(makeRequest(), { params: {} })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Missing sessionId/)
  })

  it('returns 400 when sessionId is literally the string "undefined"', async () => {
    const res = await GET(makeRequest(), { params: { sessionId: 'undefined' } })
    expect(res.status).toBe(400)
  })

  it('fetches from backend using sessionId from params', async () => {
    const res = await GET(makeRequest(), { params: { sessionId: 'sess-123' } })
    expect(mockFetch).toHaveBeenCalledWith(
      'http://test-backend.com/intents/authorize/status/sess-123',
      { method: 'GET', headers: { 'x-forwarded-for': '127.0.0.1' }, cache: 'no-store' }
    )
    expect(res.status).toBe(200)
    expect(res.body.authorized).toBe(true)
  })

  it('fetches from backend using sessionId from searchParams if params missing', async () => {
    const res = await GET(makeRequest({ sessionId: 'sess-456' }), { params: {} })
    expect(mockFetch).toHaveBeenCalledWith(
      'http://test-backend.com/intents/authorize/status/sess-456',
      expect.any(Object)
    )
    expect(res.status).toBe(200)
  })

  it('forwards backend error when fetch is not ok', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Session expired' })
    })
    const res = await GET(makeRequest(), { params: { sessionId: 'sess-123' } })
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Session expired')
  })

  it('returns 502 when fetch throws unexpectedly', async () => {
    mockFetch.mockRejectedValue(new Error('Network failure'))
    const res = await GET(makeRequest(), { params: { sessionId: 'sess-123' } })
    expect(res.status).toBe(502)
    expect(res.body.error).toBe('Network failure')
  })
})
