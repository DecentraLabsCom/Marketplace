/**
 * Tests for POST /api/provider/uploadFile
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

jest.mock('fs', () => ({ promises: { mkdir: jest.fn(), writeFile: jest.fn() } }))
jest.mock('path', () => {
  const actual = jest.requireActual('path')
  return {
    ...actual,
    join: jest.fn((...args) => args.join('/')),
    dirname: jest.fn((p) => p.split('/').slice(0, -1).join('/')),
  }
})
jest.mock('@vercel/blob', () => ({ put: jest.fn() }))
jest.mock('sharp', () => jest.fn())
jest.mock('@/utils/isVercel', () => jest.fn(() => false))
jest.mock('@/utils/dev/logger', () => ({ log: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() }))

import { promises as fs } from 'fs'
import { put } from '@vercel/blob'
import getIsVercel from '@/utils/isVercel'

function makeFormData(fields) {
  return {
    formData: async () => ({
      get: (key) => fields[key] ?? null,
    }),
  }
}

function fakeFile({ name = 'photo.jpg', size = 1024, type = 'image/jpeg' } = {}) {
  return {
    name,
    size,
    type,
    arrayBuffer: async () => new ArrayBuffer(size),
  }
}

describe('POST /api/provider/uploadFile', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    requireAuth.mockResolvedValue({ id: 'user-1' })
    requireLabOwner.mockResolvedValue(true)
    getIsVercel.mockReturnValue(false)
    fs.mkdir.mockResolvedValue()
    fs.writeFile.mockResolvedValue()
  })

  it('returns 400 when labId is missing', async () => {
    const res = await POST(makeFormData({ file: fakeFile(), destinationFolder: 'images' }))
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('MISSING_LAB_ID')
  })

  it('returns 400 when file is missing', async () => {
    const res = await POST(makeFormData({ labId: '42', destinationFolder: 'images' }))
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('MISSING_FILE')
  })

  it('returns 400 when destinationFolder is missing', async () => {
    const res = await POST(makeFormData({ labId: '42', file: fakeFile() }))
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('MISSING_DESTINATION_FOLDER')
  })

  it('returns 413 when file exceeds 10MB', async () => {
    const bigFile = fakeFile({ size: 11 * 1024 * 1024 })
    const res = await POST(makeFormData({ labId: '42', file: bigFile, destinationFolder: 'images' }))
    expect(res.status).toBe(413)
    expect(res.body.code).toBe('FILE_TOO_LARGE')
  })

  it('returns 400 for file with empty name', async () => {
    const noNameFile = fakeFile({ name: '' })
    const res = await POST(makeFormData({ labId: '42', file: noNameFile, destinationFolder: 'images' }))
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('INVALID_FILE_NAME')
  })

  it('returns 415 for invalid file type in images folder', async () => {
    const pdfFile = fakeFile({ name: 'doc.pdf', type: 'application/pdf' })
    const res = await POST(makeFormData({ labId: '42', file: pdfFile, destinationFolder: 'images' }))
    expect(res.status).toBe(415)
    expect(res.body.code).toBe('INVALID_FILE_TYPE')
  })

  it('uploads file locally on success', async () => {
    const res = await POST(makeFormData({ labId: '42', file: fakeFile(), destinationFolder: 'images' }))
    expect(fs.mkdir).toHaveBeenCalled()
    expect(fs.writeFile).toHaveBeenCalled()
    expect(res.status).toBe(201)
    expect(res.body.uploadedTo).toBe('local')
  })

  it('uses Vercel blob upload in production', async () => {
    getIsVercel.mockReturnValue(true)
    put.mockResolvedValue({ url: 'https://blob.example.com/data/42/images/photo.jpg' })
    const res = await POST(makeFormData({ labId: '42', file: fakeFile(), destinationFolder: 'images' }))
    expect(put).toHaveBeenCalled()
    expect(res.status).toBe(201)
    expect(res.body.uploadedTo).toBe('blob')
  })

  it('skips lab ownership check for temp uploads', async () => {
    await POST(makeFormData({ labId: 'temp', file: fakeFile(), destinationFolder: 'images' }))
    expect(requireLabOwner).not.toHaveBeenCalled()
  })

  it('verifies lab ownership for non-temp labIds', async () => {
    await POST(makeFormData({ labId: '42', file: fakeFile(), destinationFolder: 'images' }))
    expect(requireLabOwner).toHaveBeenCalledWith({ id: 'user-1' }, '42')
  })

  it('returns 500 when file write fails', async () => {
    fs.writeFile.mockRejectedValue(new Error('disk full'))
    const res = await POST(makeFormData({ labId: '42', file: fakeFile(), destinationFolder: 'images' }))
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('UPLOAD_ERROR')
  })
})
