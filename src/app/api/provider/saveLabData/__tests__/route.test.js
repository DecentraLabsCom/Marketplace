/**
 * Tests for POST /api/provider/saveLabData
 */
import { POST } from '../route'
import { requireAuth, requireLabOwner, handleGuardError, HttpError, BadRequestError } from '@/utils/auth/guards'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data, init) => {
      const resp = { status: init?.status ?? 200, body: data, headers: { set: jest.fn() } }
      return resp
    }),
  },
}))

jest.mock('@/utils/auth/guards', () => {
  class HttpError extends Error { constructor(msg, code) { super(msg); this.statusCode = code } }
  class BadRequestError extends HttpError { constructor(msg) { super(msg, 400); this.name = 'BadRequestError' } }
  return {
    HttpError,
    BadRequestError,
    requireAuth: jest.fn(),
    requireProviderRole: jest.fn((session) => session),
    requireLabOwner: jest.fn(),
    handleGuardError: jest.fn((err) => ({ status: err.statusCode || 400, body: { error: err.message } })),
  }
})

jest.mock('@/app/api/contract/utils/contractInstance', () => ({
  getContractInstance: jest.fn(),
}))

jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    mkdir: jest.fn(),
    writeFile: jest.fn(),
  },
}))
jest.mock('path', () => {
  const actual = jest.requireActual('path')
  return {
    ...actual,
    join: jest.fn((...args) => args.join('/')),
    dirname: jest.fn((p) => p.split('/').slice(0, -1).join('/')),
  }
})
jest.mock('@vercel/blob', () => ({ put: jest.fn() }))
jest.mock('@/utils/isVercel', () => jest.fn(() => false))

import { promises as fs } from 'fs'
import { put } from '@vercel/blob'
import getIsVercel from '@/utils/isVercel'

function makeRequest(body) {
  return { json: async () => body }
}

const VALID_LAB_DATA = {
  name: 'Test Lab',
  description: 'A test lab',
  category: 'Chemistry',
  keywords: ['test', 'lab'],
  uri: 'Lab-provider-42.json',
  id: '42',
  images: ['img1.png', 'img2.png'],
  docs: ['doc1.pdf'],
  timeSlots: [60, 120],
  availableDays: ['MONDAY', 'WEDNESDAY'],
  availableHours: { start: '09:00', end: '17:00' },
}

describe('POST /api/provider/saveLabData', () => {
  let mockContract

  beforeEach(() => {
    jest.clearAllMocks()
    requireAuth.mockResolvedValue({ id: 'user-1' })
    requireLabOwner.mockResolvedValue(true)
    getIsVercel.mockReturnValue(false)
    fs.readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
    fs.mkdir.mockResolvedValue()
    fs.writeFile.mockResolvedValue()

    mockContract = {
      tokenURI: jest.fn().mockResolvedValue('Lab-provider-42.json'),
    }
    getContractInstance.mockResolvedValue(mockContract)
  })

  it('returns 400 when labData is missing', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('MISSING_LAB_DATA')
  })

  it('returns 400 when URI is missing', async () => {
    const res = await POST(makeRequest({ labData: { name: 'Test' } }))
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('MISSING_URI')
  })

  it('returns 400 for invalid URI format', async () => {
    const res = await POST(makeRequest({ labData: { uri: 'Lab-bad format.json' } }))
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('INVALID_URI_FORMAT')
  })

  it('verifies lab ownership', async () => {
    await POST(makeRequest({ labData: VALID_LAB_DATA }))
    expect(requireLabOwner).toHaveBeenCalledWith({ id: 'user-1' }, '42')
  })

  it('validates on-chain tokenURI matches the request URI', async () => {
    mockContract.tokenURI.mockResolvedValue('Lab-other-99.json')
    const res = await POST(makeRequest({ labData: VALID_LAB_DATA }))
    expect(handleGuardError).toHaveBeenCalled()
  })

  it('saves new lab data locally on success', async () => {
    const res = await POST(makeRequest({ labData: VALID_LAB_DATA }))
    expect(fs.writeFile).toHaveBeenCalled()
    expect(res.status).toBe(200)
    expect(res.body.message).toMatch(/saved/i)
    expect(res.body.isUpdate).toBe(false)
    expect(res.body.version).toBe(1)
  })

  it('merges with existing data on update', async () => {
    const existingData = {
      name: 'Old Lab',
      attributes: [{ trait_type: 'category', value: 'Old' }],
      _meta: { version: 3 },
    }
    fs.readFile.mockResolvedValue(JSON.stringify(existingData))
    const res = await POST(makeRequest({ labData: VALID_LAB_DATA }))
    expect(res.body.isUpdate).toBe(true)
    expect(res.body.version).toBe(4)
  })

  it('returns 500 when write fails', async () => {
    fs.writeFile.mockRejectedValue(new Error('disk full'))
    const res = await POST(makeRequest({ labData: VALID_LAB_DATA }))
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('WRITE_ERROR')
  })

  it('uses Vercel blob in production', async () => {
    getIsVercel.mockReturnValue(true)
    global.fetch = jest.fn().mockResolvedValue({ ok: false })
    put.mockResolvedValue()
    const res = await POST(makeRequest({ labData: VALID_LAB_DATA }))
    expect(put).toHaveBeenCalled()
    expect(res.status).toBe(200)
  })

  it('returns 500 when reading existing data fails (non-ENOENT)', async () => {
    fs.readFile.mockRejectedValue(Object.assign(new Error('bad'), { code: 'EACCES' }))
    const res = await POST(makeRequest({ labData: VALID_LAB_DATA }))
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('READ_ERROR')
  })
})
