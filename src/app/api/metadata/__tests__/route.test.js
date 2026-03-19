/**
 * Tests for GET /api/metadata
 * Fetches metadata from fs, blob, or external URL with timeouts.
 */
import { GET } from '../route'
import fs from 'fs/promises'
import getIsVercel from '@/utils/isVercel'

jest.mock('fs/promises', () => ({ readFile: jest.fn() }))
jest.mock('@/utils/isVercel', () => jest.fn())
jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data, init) => ({
      status: init?.status ?? 200,
      body: data,
      headers: new Map()
    }))
  }
}))

function makeRequest(params = {}) {
  return { url: `http://localhost/?${new URLSearchParams(params)}` }
}

describe('GET /api/metadata', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'error').mockImplementation(() => {})
    getIsVercel.mockReturnValue(false)
    global.fetch = jest.fn()
  })

  afterEach(() => {
    console.error.mockRestore()
    jest.restoreAllMocks()
  })

  it('returns 400 when missing uri', async () => {
    const res = await GET(makeRequest({}))
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('MISSING_PARAMETER')
  })

  it('local fs: returns 404 when file not found', async () => {
    fs.readFile.mockRejectedValue(Object.assign(new Error(), { code: 'ENOENT' }))
    const res = await GET(makeRequest({ uri: 'Lab-1.json' }))
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('FILE_NOT_FOUND')
  })

  it('local fs: returns valid JSON', async () => {
    fs.readFile.mockResolvedValue('{"name":"Test Lab"}')
    const res = await GET(makeRequest({ uri: 'Lab-1.json' }))
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('Test Lab')
    expect(res.body._meta.source).toBe('local')
  })

  it('vercel blob: fetches successfully', async () => {
    getIsVercel.mockReturnValue(true)
    process.env.NEXT_PUBLIC_VERCEL_BLOB_BASE_URL = 'https://blob.com'
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ name: 'Blob Lab' })
    })
    const res = await GET(makeRequest({ uri: 'Lab-2.json', t: '123' }))
    expect(res.status).toBe(200)
    expect(res.body._meta.source).toBe('blob')
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('t=123'), expect.any(Object))
  })

  it('external fetch: proxies successfully', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ external: true })
    })
    const res = await GET(makeRequest({ uri: 'https://example.com/meta.json' }))
    expect(res.status).toBe(200)
    expect(res.body.external).toBe(true)
    expect(res.body._meta.source).toBe('external')
  })
})
