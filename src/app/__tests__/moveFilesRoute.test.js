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

jest.mock('@vercel/blob', () => ({ copy: jest.fn(), del: jest.fn(), list: jest.fn() }))
jest.mock('@/utils/isVercel', () => jest.fn(() => false))
jest.mock('@/utils/dev/logger', () => ({
  __esModule: true,
  default: { log: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

jest.mock('@/utils/auth/guards', () => ({
  requireAuth: (...args) => mockRequireAuth(...args),
  requireLabOwner: (...args) => mockRequireLabOwner(...args),
  handleGuardError: (...args) => mockHandleGuardError(...args),
  HttpError,
}))

describe('/api/provider/moveFiles route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
  })

  test('returns 403 creator mismatch when moving temp files into another creator lab', async () => {
    mockRequireLabOwner.mockRejectedValueOnce(
      new ForbiddenError('No eres el creador de este laboratorio', 'LAB_CREATOR_MISMATCH')
    )

    const { POST } = await import('../api/provider/moveFiles/route.js')
    const req = new Request('http://localhost/api/provider/moveFiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        labId: 9,
        filePaths: ['/temp/images/file.png'],
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
