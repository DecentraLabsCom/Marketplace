/**
 * @jest-environment node
 */

jest.mock('@/utils/auth/guards', () => ({
  requireAuth: jest.fn(),
  requireLabOwner: jest.fn(),
  HttpError: class MockHttpError extends Error {
    constructor(status, message, code = 'FORBIDDEN') {
      super(message)
      this.status = status
      this.code = code
    }
  },
  handleGuardError: jest.fn((error) => new Response(null, { status: error.status })),
}))

jest.mock('@/utils/isVercel', () => ({
  __esModule: true,
  default: jest.fn(() => false),
}))

jest.mock('@vercel/blob', () => ({
  copy: jest.fn(),
  del: jest.fn(),
  list: jest.fn(),
}))

import { POST } from '../moveFiles/route'
import { requireAuth, requireLabOwner } from '@/utils/auth/guards'

const mockRequireAuth = requireAuth
const mockRequireLabOwner = requireLabOwner

describe('/api/provider/moveFiles security', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'provider-1', sessionId: 'session-a', role: 'provider' })
    mockRequireLabOwner.mockResolvedValue({})
  })

  test('rejects a temporary object from another session namespace', async () => {
    const request = {
      json: async () => ({
        labId: '7',
        filePaths: ['/temp/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/images/123e4567-e89b-12d3-a456-426614174000.png'],
      }),
    }

    const response = await POST(request)

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_TEMPORARY_PATH' })
  })
})
