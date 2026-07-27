/**
 * @jest-environment node
 */

const mockRequireAuth = jest.fn()
const mockRequireProviderRole = jest.fn()
const mockRequireLabOwner = jest.fn()
const mockHandleGuardError = jest.fn((error) => (
  Response.json({ error: error.message, code: error.code }, { status: error.status })
))
const mockInvalidateMarketSnapshots = jest.fn()

class HttpError extends Error {
  constructor(message, status = 500, code = 'HTTP_ERROR') {
    super(message)
    this.status = status
    this.code = code
  }
}

jest.mock('@/utils/auth/guards', () => ({
  requireAuth: (...args) => mockRequireAuth(...args),
  requireProviderRole: (...args) => mockRequireProviderRole(...args),
  requireLabOwner: (...args) => mockRequireLabOwner(...args),
  handleGuardError: (...args) => mockHandleGuardError(...args),
  HttpError,
  BadRequestError: class BadRequestError extends HttpError {
    constructor(message) {
      super(message, 400, 'BAD_REQUEST')
    }
  },
}))

jest.mock('@/server/market/marketSnapshotStore', () => ({
  invalidateMarketSnapshots: (...args) => mockInvalidateMarketSnapshots(...args),
}))

describe('/api/market/invalidate route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'provider-1' })
    mockInvalidateMarketSnapshots.mockResolvedValue({ invalidated: true })
  })

  test('invalidates the public catalogue only for an authenticated lab owner', async () => {
    const { POST } = await import('../api/market/invalidate/route.js')
    const request = new Request('http://localhost/api/market/invalidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ labId: '4' }),
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(mockRequireAuth).toHaveBeenCalledTimes(1)
    expect(mockRequireProviderRole).toHaveBeenCalledWith({ id: 'provider-1' })
    expect(mockRequireLabOwner).toHaveBeenCalledWith({ id: 'provider-1' }, '4')
    expect(mockInvalidateMarketSnapshots).toHaveBeenCalledTimes(1)
    await expect(response.json()).resolves.toEqual({ invalidated: true })
  })
})
