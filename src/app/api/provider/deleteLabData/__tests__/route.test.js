/**
 * Tests for POST /api/provider/deleteLabData
 */
import { POST } from '../route'
import { requireAuth, requireLabOwner, handleGuardError, HttpError, BadRequestError } from '@/utils/auth/guards'

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data, init) => ({ status: init?.status ?? 200, body: data })),
  },
}))

jest.mock('@/utils/auth/guards', () => {
  class HttpError extends Error { constructor(msg, code) { super(msg); this.statusCode = code } }
  class BadRequestError extends HttpError { constructor(msg) { super(msg, 400); this.name = 'BadRequestError' } }
  return {
    HttpError,
    BadRequestError,
    requireAuth: jest.fn(),
    requireLabOwner: jest.fn(),
    handleGuardError: jest.fn((err) => ({ status: err.statusCode || 400, body: { error: err.message } })),
  }
})

jest.mock('fs', () => ({ promises: { unlink: jest.fn() } }))
jest.mock('path', () => ({ join: jest.fn((...args) => args.join('/')) }))
jest.mock('@vercel/blob', () => ({ del: jest.fn() }))
jest.mock('@/utils/isVercel', () => jest.fn(() => false))
jest.mock('@/utils/dev/logger', () => ({ log: jest.fn(), warn: jest.fn(), error: jest.fn() }))

import { promises as fs } from 'fs'
import { del } from '@vercel/blob'
import getIsVercel from '@/utils/isVercel'

function makeRequest(body) {
  return { json: async () => body }
}

describe('POST /api/provider/deleteLabData', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    requireAuth.mockResolvedValue({ id: 'user-1' })
    requireLabOwner.mockResolvedValue(true)
    getIsVercel.mockReturnValue(false)
    fs.unlink.mockResolvedValue()
  })

  it('returns 400 when labURI is missing', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/missing or invalid laburi/i)
  })

  it('returns 400 when labURI is empty string', async () => {
    const res = await POST(makeRequest({ labURI: '  ' }))
    expect(res.status).toBe(400)
  })

  it('returns error when labId cannot be extracted from URI', async () => {
    const res = await POST(makeRequest({ labURI: 'bad-format.txt' }))
    // Should throw BadRequestError → handleGuardError
    expect(handleGuardError).toHaveBeenCalled()
  })

  it('verifies lab ownership before deleting', async () => {
    await POST(makeRequest({ labURI: 'Lab-provider-42.json' }))
    expect(requireLabOwner).toHaveBeenCalledWith({ id: 'user-1' }, '42')
  })

  it('deletes file locally on success', async () => {
    const res = await POST(makeRequest({ labURI: 'Lab-provider-42.json' }))
    expect(fs.unlink).toHaveBeenCalled()
    expect(res.status).toBe(200)
    expect(res.body.message).toMatch(/deleted successfully/i)
  })

  it('returns 404 when local file does not exist', async () => {
    fs.unlink.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
    const res = await POST(makeRequest({ labURI: 'Lab-provider-42.json' }))
    expect(res.status).toBe(404)
  })

  it('returns 500 on unexpected local delete error', async () => {
    fs.unlink.mockRejectedValue(new Error('permission denied'))
    const res = await POST(makeRequest({ labURI: 'Lab-provider-42.json' }))
    expect(res.status).toBe(500)
  })

  it('uses Vercel blob deletion in production', async () => {
    getIsVercel.mockReturnValue(true)
    del.mockResolvedValue(true)
    const res = await POST(makeRequest({ labURI: 'Lab-provider-42.json' }))
    expect(del).toHaveBeenCalled()
    expect(res.status).toBe(200)
  })

  it('returns 500 when blob deletion fails', async () => {
    getIsVercel.mockReturnValue(true)
    del.mockRejectedValue(new Error('blob error'))
    const res = await POST(makeRequest({ labURI: 'Lab-provider-42.json' }))
    expect(res.status).toBe(500)
  })
})
