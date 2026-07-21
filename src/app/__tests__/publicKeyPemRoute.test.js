/**
 * @jest-environment node
 */

import fs from 'fs'
import { generateKeyPairSync } from 'node:crypto'

jest.mock('fs', () => ({
  __esModule: true,
  default: {
    readFileSync: jest.fn(),
  },
}))

describe('/.well-known/public-key.pem route', () => {
  const originalEnv = process.env
  let consoleErrorSpy

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.JWT_PUBLIC_KEY
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
    const { GET } = await import('../.well-known/public-key.pem/route.js')
    process.env.JWT_PUBLIC_KEY = '-----BEGIN PUBLIC KEY-----\nABC\n-----END PUBLIC KEY-----'
    const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    fs.readFileSync.mockImplementation(() => { throw enoent })

    const res = await GET()
    expect(res.status).toBe(200)
    await expect(res.text()).resolves.toContain('BEGIN PUBLIC KEY')
  })

  test('returns 500 when env var PEM is invalid', async () => {
    const { GET } = await import('../.well-known/public-key.pem/route.js')
    process.env.JWT_PUBLIC_KEY = 'not-a-pem'
    const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    fs.readFileSync.mockImplementation(() => { throw enoent })

    const res = await GET()
    expect(res.status).toBe(500)
    await expect(res.text()).resolves.toMatch(/Invalid public key format/i)
  })

  test('returns 404 when file is missing and env var not set', async () => {
    const { GET } = await import('../.well-known/public-key.pem/route.js')
    const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    fs.readFileSync.mockImplementation(() => { throw enoent })

    const res = await GET()
    expect(res.status).toBe(404)
    await expect(res.text()).resolves.toMatch(/Public key not found/i)
  })

  test('reads from public/.well-known/public-key.pem when file exists', async () => {
    const { GET } = await import('../.well-known/public-key.pem/route.js')
    fs.readFileSync.mockReturnValue('-----BEGIN PUBLIC KEY-----\nDEF\n-----END PUBLIC KEY-----')

    await GET()

    const calledPath = fs.readFileSync.mock.calls[0][0]
    expect(calledPath).toMatch(/public[/\\]\.well-known[/\\]public-key\.pem$/)
  })

  test('returns key from file when env var not set and file exists', async () => {
    const { GET } = await import('../.well-known/public-key.pem/route.js')
    fs.readFileSync.mockReturnValue('-----BEGIN PUBLIC KEY-----\nDEF\n-----END PUBLIC KEY-----')

    const res = await GET()
    expect(res.status).toBe(200)
    await expect(res.text()).resolves.toContain('DEF')
  })

  test('prefers key from env var when both file and env var are present', async () => {
    const { GET } = await import('../.well-known/public-key.pem/route.js')
    process.env.JWT_PUBLIC_KEY = '-----BEGIN PUBLIC KEY-----\nABC\n-----END PUBLIC KEY-----'
    fs.readFileSync.mockReturnValue('-----BEGIN PUBLIC KEY-----\nDEF\n-----END PUBLIC KEY-----')

    const res = await GET()
    expect(res.status).toBe(200)
    await expect(res.text()).resolves.toContain('ABC')
    expect(fs.readFileSync).not.toHaveBeenCalled()
  })

  test('derives the published key from the signing key when both runtime keys are present', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    process.env.JWT_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' })
    process.env.JWT_PUBLIC_KEY = '-----BEGIN PUBLIC KEY-----\nSTALE\n-----END PUBLIC KEY-----'

    const { GET } = await import('../.well-known/public-key.pem/route.js')
    const res = await GET()

    expect(res.status).toBe(200)
    await expect(res.text()).resolves.toBe(publicKey.export({ type: 'spki', format: 'pem' }))
    expect(fs.readFileSync).not.toHaveBeenCalled()
  })
})
