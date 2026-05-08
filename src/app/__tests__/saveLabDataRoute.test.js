/**
 * @jest-environment node
 */

const mockRequireAuth = jest.fn()
const mockRequireLabOwner = jest.fn()
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

class ForbiddenError extends HttpError {
  constructor(message, code = 'FORBIDDEN') {
    super(message, 403, code)
  }
}

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body, options = {}) => Response.json(body, options)),
  },
}))

jest.mock('@/utils/auth/guards', () => ({
  requireAuth: (...args) => mockRequireAuth(...args),
  requireProviderRole: jest.fn(), // no-op: tests focus on ownership, not provider role
  requireLabOwner: (...args) => mockRequireLabOwner(...args),
  handleGuardError: (...args) => mockHandleGuardError(...args),
  HttpError,
  BadRequestError: class BadRequestError extends HttpError {
    constructor(message) {
      super(message, 400, 'BAD_REQUEST')
    }
  },
}))

jest.mock('@/app/api/contract/utils/contractInstance', () => ({
  getContractInstance: jest.fn(),
}))

describe('/api/provider/saveLabData route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
  })

  test('returns 403 creator mismatch when requireLabOwner blocks SSO user', async () => {
    mockRequireLabOwner.mockRejectedValueOnce(
      new ForbiddenError('No eres el creador de este laboratorio', 'LAB_CREATOR_MISMATCH')
    )

    const { POST } = await import('../api/provider/saveLabData/route.js')

    const req = new Request('http://localhost/api/provider/saveLabData', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        labData: {
          id: 7,
          uri: 'Lab-provider-7.json',
        },
      }),
    })

    const res = await POST(req)

    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({
      error: 'No eres el creador de este laboratorio',
      code: 'LAB_CREATOR_MISMATCH',
    })
    expect(mockHandleGuardError).toHaveBeenCalled()
  })
})
