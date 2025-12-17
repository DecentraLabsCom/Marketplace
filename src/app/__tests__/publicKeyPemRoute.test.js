/**
 * @jest-environment node
 */

import fs from 'fs'

jest.mock('fs', () => ({
  __esModule: true,
  default: {
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
  },
}))

describe('/.well-known/public-key.pem route', () => {
  const originalEnv = process.env
  let consoleErrorSpy

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.JWT_PUBLIC_KEY
    fs.existsSync.mockReset()
    fs.readFileSync.mockReset()
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy?.mockRestore()
  })

  afterAll(() => {
    process.env = originalEnv
  })

  test('returns public key from env var when valid PEM', async () => {
    const { GET } = await import('../.well-known/public-key.pem/route')
    process.env.JWT_PUBLIC_KEY = '-----BEGIN PUBLIC KEY-----\nABC\n-----END PUBLIC KEY-----'

    const res = await GET()
    expect(res.status).toBe(200)
    await expect(res.text()).resolves.toContain('BEGIN PUBLIC KEY')
  })

  test('returns 500 when env var PEM is invalid', async () => {
    const { GET } = await import('../.well-known/public-key.pem/route')
    process.env.JWT_PUBLIC_KEY = 'not-a-pem'

    const res = await GET()
    expect(res.status).toBe(500)
    await expect(res.text()).resolves.toMatch(/Invalid public key format/i)
  })

  test('returns 404 when file is missing and env var not set', async () => {
    const { GET } = await import('../.well-known/public-key.pem/route')
    fs.existsSync.mockReturnValue(false)

    const res = await GET()
    expect(res.status).toBe(404)
    await expect(res.text()).resolves.toMatch(/Public key not found/i)
  })

  test('returns key from file when env var not set and file exists', async () => {
    const { GET } = await import('../.well-known/public-key.pem/route')
    fs.existsSync.mockReturnValue(true)
    fs.readFileSync.mockReturnValue('-----BEGIN PUBLIC KEY-----\nDEF\n-----END PUBLIC KEY-----')

    const res = await GET()
    expect(res.status).toBe(200)
    await expect(res.text()).resolves.toContain('DEF')
  })
})

