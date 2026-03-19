/**
 * Tests for GET /api/backend/intents/[requestId]
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

describe('GET /api/backend/intents/[requestId]', () => {
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
      json: async () => ({ status: 'COMPLETED' })
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
    const res = await GET(makeRequest(), { params: { requestId: '123' } })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Missing institutional backend URL/)
  })

  it('returns 400 when requestId is technically missing from params and searchParams', async () => {
    const res = await GET(makeRequest(), { params: {} })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Missing requestId/)
  })

  it('returns 400 when requestId is literally the string "null"', async () => {
    const res = await GET(makeRequest(), { params: { requestId: 'null' } })
    expect(res.status).toBe(400)
  })

  it('fetches from backend using requestId from params', async () => {
    const res = await GET(makeRequest(), { params: { requestId: 'req-123' } })
    expect(mockFetch).toHaveBeenCalledWith(
      'http://test-backend.com/intents/req-123',
      { method: 'GET', headers: { 'x-forwarded-for': '127.0.0.1' }, cache: 'no-store' }
    )
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('COMPLETED')
  })

  it('fetches from backend using requestId from searchParams if params missing', async () => {
    const res = await GET(makeRequest({ requestId: 'req-456' }), { params: {} })
    expect(mockFetch).toHaveBeenCalledWith(
      'http://test-backend.com/intents/req-456',
      expect.any(Object)
    )
    expect(res.status).toBe(200)
  })

  it('forwards backend error when fetch is not ok', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Intent not found on backend' })
    })
    const res = await GET(makeRequest(), { params: { requestId: 'req-123' } })
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Intent not found on backend')
  })

  it('returns 502 when fetch throws unexpectedly', async () => {
    mockFetch.mockRejectedValue(new Error('Network failure'))
    const res = await GET(makeRequest(), { params: { requestId: 'req-123' } })
    expect(res.status).toBe(502)
    expect(res.body.error).toBe('Network failure')
  })
})
