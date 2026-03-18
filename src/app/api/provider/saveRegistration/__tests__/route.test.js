/**
 * Tests for POST /api/provider/saveRegistration
 *
 * This route uses the native Response.json() instead of NextResponse.json().
 * jsdom doesn't define Response.json, so we polyfill it here.
 */

// ── Polyfill Response.json for jsdom ───────────────────────────────────────
// Must be done before importing the route module.
if (typeof globalThis.Response === 'undefined') {
  globalThis.Response = class Response {
    constructor(body, init) {
      this._body = body
      this.status = init?.status ?? 200
      this.headers = new Map(Object.entries(init?.headers ?? {}))
    }
    async json() { return JSON.parse(this._body) }
    async text() { return this._body }
  }
}
if (typeof globalThis.Response.json !== 'function') {
  globalThis.Response.json = (data, init) => new globalThis.Response(JSON.stringify(data), {
    status: init?.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
}

import { POST } from '../route'

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
}))
jest.mock('path', () => ({
  resolve: jest.fn((...args) => args.join('/')),
  dirname: jest.fn((p) => p.split('/').slice(0, -1).join('/')),
  join: jest.fn((...args) => args.join('/')),
}))
jest.mock('@vercel/blob', () => ({ put: jest.fn() }))
jest.mock('@/utils/isVercel', () => jest.fn(() => false))
jest.mock('@/utils/dev/logger', () => ({ log: jest.fn(), warn: jest.fn(), error: jest.fn() }))

import fs from 'fs'
import getIsVercel from '@/utils/isVercel'

function makeRequest(body) {
  return { json: async () => body }
}

describe('POST /api/provider/saveRegistration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    getIsVercel.mockReturnValue(false)
    fs.existsSync.mockReturnValue(false)
    fs.writeFileSync.mockReturnValue()
    fs.readFileSync.mockReturnValue('[]')
  })

  afterEach(() => {
    console.error.mockRestore()
    console.warn.mockRestore()
  })

  it('returns 400 when name is missing', async () => {
    const res = await POST(makeRequest({ email: 'a@b.com' }))
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.code).toBe('MISSING_REQUIRED_FIELDS')
  })

  it('returns 400 when email is missing', async () => {
    const res = await POST(makeRequest({ name: 'Test Provider' }))
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.code).toBe('MISSING_REQUIRED_FIELDS')
  })

  it('returns 400 for invalid email format', async () => {
    const res = await POST(makeRequest({ name: 'Test', email: 'not-an-email' }))
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.code).toBe('INVALID_EMAIL')
  })

  it('returns 400 when name is too short', async () => {
    const res = await POST(makeRequest({ name: 'A', email: 'a@b.com' }))
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.code).toBe('INVALID_NAME_LENGTH')
  })

  it('saves new provider on success (local)', async () => {
    fs.existsSync.mockReturnValue(false)
    const res = await POST(makeRequest({ name: 'Test Provider', email: 'test@example.com', organization: 'Org' }))
    const data = await res.json()
    expect(res.status).toBe(201)
    expect(data.provider.name).toBe('Test Provider')
    expect(data.provider.email).toBe('test@example.com')
    expect(data.provider.status).toBe('pending')
    expect(fs.writeFileSync).toHaveBeenCalled()
  })

  it('returns 409 when email already exists', async () => {
    fs.existsSync.mockReturnValue(true)
    fs.readFileSync.mockReturnValue(JSON.stringify([{
      name: 'Existing', email: 'test@example.com', status: 'pending', createdAt: '2024-01-01',
    }]))
    const res = await POST(makeRequest({ name: 'New Provider', email: 'test@example.com' }))
    const data = await res.json()
    expect(res.status).toBe(409)
    expect(data.code).toBe('DUPLICATE_EMAIL')
  })

  it('returns 500 when reading existing providers fails', async () => {
    fs.existsSync.mockReturnValue(true)
    fs.readFileSync.mockImplementation(() => { throw new Error('read error') })
    const res = await POST(makeRequest({ name: 'Test', email: 'a@b.com' }))
    const data = await res.json()
    expect(res.status).toBe(500)
    expect(data.code).toBe('READ_ERROR')
  })

  it('returns 500 when writing providers fails', async () => {
    fs.existsSync.mockReturnValue(false)
    fs.writeFileSync.mockImplementation(() => { throw new Error('write error') })
    const res = await POST(makeRequest({ name: 'Test Provider', email: 'a@b.com' }))
    const data = await res.json()
    expect(res.status).toBe(500)
    expect(data.code).toBe('WRITE_ERROR')
  })

  it('defaults registrationType to manual', async () => {
    const res = await POST(makeRequest({ name: 'Test', email: 'a@b.com' }))
    const data = await res.json()
    expect(data.provider.registrationType).toBe('manual')
  })
})
