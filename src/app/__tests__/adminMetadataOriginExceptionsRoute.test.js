/**
 * @jest-environment node
 */

import { requireAuth } from '@/utils/auth/guards'
import { requirePlatformAdminSession } from '@/utils/auth/platformAdmin'
import {
  listMetadataOriginExceptions,
  removeMetadataOriginException,
  setMetadataOriginException,
} from '@/utils/metadata/metadataOriginExceptions'

jest.mock('@/utils/auth/guards', () => {
  class HttpError extends Error {
    constructor(status, message, code) {
      super(message)
      this.status = status
      this.code = code
    }
  }
  return { requireAuth: jest.fn(), HttpError }
})

jest.mock('@/utils/auth/platformAdmin', () => ({
  requirePlatformAdminSession: jest.fn(),
}))

jest.mock('@/utils/metadata/metadataOriginExceptions', () => ({
  listMetadataOriginExceptions: jest.fn(),
  removeMetadataOriginException: jest.fn(),
  setMetadataOriginException: jest.fn(),
}))

jest.mock('@/utils/api/rateLimit', () => ({
  createRateLimiter: () => jest.fn(async () => ({ limited: false })),
  createRateLimitResponse: jest.fn(),
}))

describe('/api/admin/metadata-origin-exceptions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    requireAuth.mockResolvedValue({ samlAssertion: 'assertion', email: 'admin@example.edu' })
    requirePlatformAdminSession.mockReturnValue('admin@example.edu')
    listMetadataOriginExceptions.mockResolvedValue([])
  })

  test('lists the reviewed global exceptions only for a platform administrator', async () => {
    listMetadataOriginExceptions.mockResolvedValue([{
      origin: 'https://research-cdn.example.edu',
      owner: 'Research infrastructure team',
      reason: 'Shared metadata CDN',
    }])
    const { GET } = await import('../api/admin/metadata-origin-exceptions/route')

    const response = await GET(new Request('https://marketplace.example/api/admin/metadata-origin-exceptions'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      exceptions: [expect.objectContaining({ origin: 'https://research-cdn.example.edu' })],
    })
  })

  test('does not disclose global exceptions when platform authorization fails', async () => {
    const { HttpError } = await import('@/utils/auth/guards')
    requirePlatformAdminSession.mockImplementation(() => {
      throw new HttpError(403, 'Access denied', 'FORBIDDEN')
    })
    const { GET } = await import('../api/admin/metadata-origin-exceptions/route')

    const response = await GET(new Request('https://marketplace.example/api/admin/metadata-origin-exceptions'))

    expect(response.status).toBe(403)
    expect(listMetadataOriginExceptions).not.toHaveBeenCalled()
  })

  test('records owner, reason and administrator when creating an exception', async () => {
    setMetadataOriginException.mockResolvedValue({ origin: 'https://research-cdn.example.edu' })
    const { POST } = await import('../api/admin/metadata-origin-exceptions/route')

    const response = await POST(new Request('https://marketplace.example/api/admin/metadata-origin-exceptions', {
      method: 'POST',
      body: JSON.stringify({
        origin: 'https://research-cdn.example.edu',
        owner: 'Research infrastructure team',
        reason: 'Shared metadata CDN',
      }),
    }))

    expect(response.status).toBe(201)
    expect(setMetadataOriginException).toHaveBeenCalledWith(expect.objectContaining({
      origin: 'https://research-cdn.example.edu',
      owner: 'Research infrastructure team',
      reason: 'Shared metadata CDN',
      updatedBy: 'admin@example.edu',
    }))
  })

  test('revokes an exception without requiring a deployment', async () => {
    const { DELETE } = await import('../api/admin/metadata-origin-exceptions/route')

    const response = await DELETE(new Request('https://marketplace.example/api/admin/metadata-origin-exceptions', {
      method: 'DELETE',
      body: JSON.stringify({ origin: 'https://research-cdn.example.edu' }),
    }))

    expect(response.status).toBe(204)
    expect(removeMetadataOriginException).toHaveBeenCalledWith('https://research-cdn.example.edu')
  })
})
