/**
 * Tests for POST /api/provider/moveFiles
 */
import { POST } from '../route'
import { requireAuth, requireLabOwner, handleGuardError, HttpError } from '@/utils/auth/guards'

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
    handleGuardError: jest.fn((err) => ({ status: err.statusCode || 400, body: { error: err.message } })),
  }
})

jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    copyFile: jest.fn(),
    unlink: jest.fn(),
    readdir: jest.fn(),
    rmdir: jest.fn(),
  },
}))
jest.mock('path', () => {
  const actual = jest.requireActual('path')
  return {
    ...actual,
    join: jest.fn((...args) => args.join('/')),
    dirname: jest.fn((p) => p.split('/').slice(0, -1).join('/')),
    sep: '/',
  }
})
jest.mock('@vercel/blob', () => ({
  copy: jest.fn(),
  del: jest.fn(),
  list: jest.fn(),
}))
jest.mock('@/utils/isVercel', () => jest.fn(() => false))
jest.mock('@/utils/dev/logger', () => ({ log: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() }))

import { promises as fs } from 'fs'
import { copy, del } from '@vercel/blob'
import getIsVercel from '@/utils/isVercel'

function makeRequest(body) {
  return { json: async () => body }
}

describe('POST /api/provider/moveFiles', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    requireAuth.mockResolvedValue({ id: 'user-1' })
    requireLabOwner.mockResolvedValue(true)
    getIsVercel.mockReturnValue(false)
    fs.mkdir.mockResolvedValue()
    fs.copyFile.mockResolvedValue()
    fs.unlink.mockResolvedValue()
    fs.readdir.mockResolvedValue(['remaining-file.jpg'])
    fs.rmdir.mockResolvedValue()
  })

  it('returns 400 when filePaths is missing', async () => {
    const res = await POST(makeRequest({ labId: '42' }))
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('MISSING_FILE_PATHS')
  })

  it('returns 400 when filePaths is not an array', async () => {
    const res = await POST(makeRequest({ filePaths: 'not-array', labId: '42' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when labId is missing', async () => {
    const res = await POST(makeRequest({ filePaths: ['/temp/images/photo.jpg'] }))
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('MISSING_LAB_ID')
  })

  it('verifies lab ownership', async () => {
    await POST(makeRequest({ filePaths: ['/temp/images/photo.jpg'], labId: '42' }))
    expect(requireLabOwner).toHaveBeenCalledWith({ id: 'user-1' }, '42')
  })

  it('moves files locally on success', async () => {
    const res = await POST(makeRequest({ filePaths: ['/temp/images/photo.jpg'], labId: '42' }))
    expect(fs.copyFile).toHaveBeenCalled()
    expect(fs.unlink).toHaveBeenCalled()
    expect(res.status).toBe(200)
    expect(res.body.movedFiles).toHaveLength(1)
  })

  it('returns 500 when all moves fail', async () => {
    fs.copyFile.mockRejectedValue(new Error('copy failed'))
    const res = await POST(makeRequest({ filePaths: ['/temp/images/photo.jpg'], labId: '42' }))
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('MOVE_ALL_FAILED')
  })

  it('returns 207 on partial success', async () => {
    fs.copyFile
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error('copy failed'))
    fs.unlink.mockResolvedValue()
    const res = await POST(makeRequest({
      filePaths: ['/temp/images/ok.jpg', '/temp/images/fail.jpg'],
      labId: '42',
    }))
    expect(res.status).toBe(207)
    expect(res.body.movedFiles).toHaveLength(1)
    expect(res.body.errors).toHaveLength(1)
  })

  it('rejects files not in temp folder', async () => {
    const res = await POST(makeRequest({ filePaths: ['/42/images/photo.jpg'], labId: '42' }))
    expect(res.status).toBe(500)
    expect(res.body.errors[0].error).toMatch(/temp folder/i)
  })

  it('uses Vercel blob copy+del in production', async () => {
    getIsVercel.mockReturnValue(true)
    copy.mockResolvedValue({ url: 'https://blob.example.com/data/42/images/photo.jpg' })
    del.mockResolvedValue()
    const res = await POST(makeRequest({ filePaths: ['/temp/images/photo.jpg'], labId: '42' }))
    expect(copy).toHaveBeenCalled()
    expect(del).toHaveBeenCalled()
    expect(res.status).toBe(200)
    expect(res.body.movedFiles[0].storage).toBe('blob')
  })
})
