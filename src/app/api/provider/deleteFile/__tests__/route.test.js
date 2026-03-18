/**
 * Tests for POST /api/provider/deleteFile
 */
import { POST } from '../route'
import { requireAuth, requireLabOwner, extractLabIdFromPath, handleGuardError, HttpError } from '@/utils/auth/guards'

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data, init) => ({ status: init?.status ?? 200, body: data })),
  },
}))

jest.mock('@/utils/auth/guards', () => {
  class HttpError extends Error { constructor(msg, code) { super(msg); this.statusCode = code } }
  return {
    HttpError,
    requireAuth: jest.fn(),
    requireLabOwner: jest.fn(),
    extractLabIdFromPath: jest.fn(),
    handleGuardError: jest.fn((err) => ({ status: err.statusCode || 400, body: { error: err.message } })),
  }
})

jest.mock('fs', () => ({ promises: { unlink: jest.fn(), readdir: jest.fn(), rmdir: jest.fn() } }))
jest.mock('path', () => {
  const actual = jest.requireActual('path')
  return {
    ...actual,
    join: jest.fn((...args) => args.join('/')),
    normalize: jest.fn((p) => p),
    dirname: jest.fn((p) => p.split('/').slice(0, -1).join('/')),
    resolve: jest.fn((...args) => args.join('/')),
    sep: '/',
  }
})
jest.mock('@vercel/blob', () => ({ del: jest.fn() }))
jest.mock('@/utils/isVercel', () => jest.fn(() => false))
jest.mock('@/utils/dev/logger', () => ({ log: jest.fn(), warn: jest.fn(), error: jest.fn() }))

import { promises as fs } from 'fs'
import { del } from '@vercel/blob'
import getIsVercel from '@/utils/isVercel'

function makeFormData(fields) {
  return {
    formData: async () => ({
      get: (key) => fields[key] ?? null,
    }),
  }
}

describe('POST /api/provider/deleteFile', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    requireAuth.mockResolvedValue({ id: 'user-1' })
    requireLabOwner.mockResolvedValue(true)
    extractLabIdFromPath.mockReturnValue('42')
    getIsVercel.mockReturnValue(false)
    fs.unlink.mockResolvedValue()
  })

  it('returns 400 when filePath is missing', async () => {
    const res = await POST(makeFormData({}))
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('MISSING_FILE_PATH')
  })

  it('returns 400 when filePath is empty string', async () => {
    const res = await POST(makeFormData({ filePath: '  ' }))
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('INVALID_FILE_PATH')
  })

  it('verifies lab ownership based on extracted labId', async () => {
    extractLabIdFromPath.mockReturnValue('99')
    await POST(makeFormData({ filePath: '99/images/photo.jpg' }))
    expect(requireLabOwner).toHaveBeenCalledWith({ id: 'user-1' }, '99')
  })

  it('deletes file locally on success', async () => {
    const res = await POST(makeFormData({ filePath: '42/images/photo.jpg' }))
    expect(fs.unlink).toHaveBeenCalled()
    expect(res.status).toBe(200)
    expect(res.body.message).toMatch(/deleted successfully/i)
  })

  it('treats ENOENT as successful deletion', async () => {
    fs.unlink.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
    const res = await POST(makeFormData({ filePath: '42/images/photo.jpg' }))
    expect(res.status).toBe(200)
  })

  it('returns 500 on unexpected local delete error', async () => {
    fs.unlink.mockRejectedValue(new Error('permission denied'))
    const res = await POST(makeFormData({ filePath: '42/images/photo.jpg' }))
    expect(res.status).toBe(500)
  })

  it('uses Vercel blob deletion in production', async () => {
    getIsVercel.mockReturnValue(true)
    del.mockResolvedValue(true)
    const res = await POST(makeFormData({ filePath: '42/images/photo.jpg' }))
    expect(del).toHaveBeenCalled()
    expect(res.status).toBe(200)
  })

  it('returns 500 on blob deletion error', async () => {
    getIsVercel.mockReturnValue(true)
    del.mockRejectedValue(new Error('blob error'))
    const res = await POST(makeFormData({ filePath: '42/images/photo.jpg' }))
    expect(res.status).toBe(500)
  })
})
