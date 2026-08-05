/**
 * @jest-environment node
 */

jest.mock('fs', () => ({
  promises: {
    unlink: jest.fn().mockResolvedValue(undefined),
  },
}))

jest.mock('@vercel/blob', () => ({
  del: jest.fn(),
}))

jest.mock('@/utils/isVercel', () => ({
  __esModule: true,
  default: jest.fn(() => false),
}))

jest.mock('@/utils/storage/fileSecurity', () => ({
  resolveManagedLocalPath: jest.fn(() => 'C:/data/Lab-provider-1.json'),
}))

jest.mock('@/utils/api/rateLimit', () => ({
  createRateLimiter: jest.fn(() => jest.fn().mockResolvedValue(null)),
  createRateLimitResponse: jest.fn(() => null),
}))

jest.mock('@/utils/auth/guards', () => {
  class MockHttpError extends Error {
    constructor(status, message) {
      super(message)
      this.status = status
    }
  }
  class MockBadRequestError extends MockHttpError {
    constructor(message) { super(400, message) }
  }
  return {
    requireAuth: jest.fn(),
    requireLabOwner: jest.fn(),
    handleGuardError: jest.fn((error) => new Response(JSON.stringify({ error: error.message }), {
      status: error.status,
    })),
    HttpError: MockHttpError,
    BadRequestError: MockBadRequestError,
  }
})

import { POST } from '../deleteLabData/route'
import { promises as fs } from 'fs'
import { requireAuth, requireLabOwner } from '@/utils/auth/guards'

function request(body) {
  return new Request('http://localhost/api/provider/deleteLabData', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('/api/provider/deleteLabData', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    requireAuth.mockResolvedValue({ id: 'provider-1' })
  })

  test('authorizes with the minted lab ID when the managed filename has another suffix', async () => {
    const response = await POST(request({ labURI: 'Lab-provider-1.json', labId: 3 }))

    expect(response.status).toBe(200)
    expect(requireLabOwner).toHaveBeenCalledWith(expect.anything(), '3')
    expect(fs.unlink).toHaveBeenCalled()
  })

  test('extracts a managed filename from the metadata API URI', async () => {
    const response = await POST(request({
      labURI: 'https://market.example/api/metadata?uri=Lab-provider-1.json&labId=3',
      labId: 3,
    }))

    expect(response.status).toBe(200)
    expect(fs.unlink).toHaveBeenCalled()
  })
})
