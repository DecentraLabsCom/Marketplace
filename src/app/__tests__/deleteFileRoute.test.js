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

class ConflictError extends HttpError {
  constructor(message, code = 'CONFLICT') {
    super(message, 409, code)
  }
}

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body, options = {}) => Response.json(body, options)),
  },
}))

jest.mock('@vercel/blob', () => ({ del: jest.fn() }))
jest.mock('@/utils/isVercel', () => jest.fn(() => false))
jest.mock('@/utils/dev/logger', () => ({
  __esModule: true,
  default: { log: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

jest.mock('@/utils/auth/guards', () => ({
  requireAuth: (...args) => mockRequireAuth(...args),
  requireLabOwner: (...args) => mockRequireLabOwner(...args),
  extractLabIdFromPath: jest.fn((filePath) => {
    const match = String(filePath || '').match(/^\/?(\d+)\//)
    return match ? match[1] : null
  }),
  handleGuardError: (...args) => mockHandleGuardError(...args),
  HttpError,
}))

describe('/api/provider/deleteFile route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
  })

  test('returns 409 legacy blocked when deleting file from legacy lab', async () => {
    mockRequireLabOwner.mockRejectedValueOnce(
      new ConflictError('Legacy lab blocked', 'LAB_LEGACY_BLOCKED')
    )

    const { POST } = await import('../api/provider/deleteFile/route.js')
    const formData = new FormData()
    formData.append('filePath', '/11/images/file.png')
    formData.append('deletingLab', 'false')

    const req = new Request('http://localhost/api/provider/deleteFile', {
      method: 'POST',
      body: formData,
    })

    const res = await POST(req)

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({
      error: 'Legacy lab blocked',
      code: 'LAB_LEGACY_BLOCKED',
    })
    expect(mockHandleGuardError).toHaveBeenCalled()
  })
})
