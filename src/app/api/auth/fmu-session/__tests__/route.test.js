/**
 * @jest-environment node
 */

import { requireAuth } from '@/utils/auth/guards'
import {
  FMU_CONTEXT_COOKIE,
  createFmuUserBinding,
  encodeFmuContexts,
  readFmuContexts,
} from '@/utils/auth/fmuSessionStore'
import {
  GatewayValidationError,
  gatewayFetch,
  resolveLabAccessGateway,
} from '@/utils/api/gatewayProxy'

jest.mock('@/utils/auth/guards', () => {
  const actual = jest.requireActual('@/utils/auth/guards')
  return { ...actual, requireAuth: jest.fn() }
})

jest.mock('@/utils/api/gatewayProxy', () => ({
  GatewayValidationError: class GatewayValidationError extends Error {
    constructor(message, status = 400) {
      super(message)
      this.status = status
    }
  },
  gatewayFetch: jest.fn(),
  resolveLabAccessGateway: jest.fn(),
}))

describe('POST /api/auth/fmu-session', () => {
  const originalSecret = process.env.SESSION_SECRET

  beforeAll(() => {
    process.env.SESSION_SECRET = 'test-session-secret-with-at-least-32-characters'
  })

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.SESSION_SECRET
    else process.env.SESSION_SECRET = originalSecret
  })

  beforeEach(() => {
    jest.clearAllMocks()
    requireAuth.mockResolvedValue({ id: 'user-1', sessionId: 'a'.repeat(43) })
    resolveLabAccessGateway.mockResolvedValue('https://lite.lab.example')
    gatewayFetch.mockResolvedValue({
      status: 204,
      headers: new Headers({
        'Set-Cookie': 'FMU_SESSION=session_identifier_aaaaaaaa; Max-Age=300; Path=/fmu; Secure; HttpOnly; SameSite=None',
      }),
    })
  })

  test('exchanges server-side and stores only an encrypted same-site context cookie', async () => {
    const { POST } = await import('../route')
    const response = await POST(new Request('https://marketplace.example.com/api/auth/fmu-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessCode: 'opaque-code',
        labURL: 'https://lite.lab.example/fmu/',
        labId: '42',
        reservationKey: '0xaaa',
      }),
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ gatewayOrigin: 'https://lite.lab.example' })
    expect(resolveLabAccessGateway).toHaveBeenCalledWith({
      labId: '42',
    })
    expect(gatewayFetch).toHaveBeenCalledWith(
      'https://lite.lab.example/auth/access',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }),
    )
    const setCookie = response.headers.get('set-cookie')
    expect(setCookie).toContain('marketplace_fmu_contexts=')
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=lax')
    expect(setCookie).not.toContain('session_identifier_aaaaaaaa')
    expect(setCookie).not.toContain('opaque-code')

    const encoded = setCookie.match(/marketplace_fmu_contexts=([^;]+)/)?.[1]
    const storedRequest = new Request('https://marketplace.example.com/api/simulations/history', {
      headers: { Cookie: `${FMU_CONTEXT_COOKIE}=${encoded}` },
    })
    expect(readFmuContexts(storedRequest)).toEqual([
      expect.objectContaining({ userBinding: createFmuUserBinding({ id: 'user-1' }) }),
    ])
  })

  test('rejects a labURL whose origin differs from the on-chain gateway', async () => {
    resolveLabAccessGateway.mockRejectedValueOnce(
      new GatewayValidationError('Provided lab destination does not match on-chain lab access URI'),
    )
    const { POST } = await import('../route')
    const response = await POST(new Request('https://marketplace.example.com/api/auth/fmu-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessCode: 'opaque-code',
        labURL: 'https://evil.example.com/fmu/',
        labId: '42',
        reservationKey: '0xaaa',
      }),
    }))

    expect(response.status).toBe(400)
    expect(gatewayFetch).not.toHaveBeenCalled()
  })

  test('replaces an inherited capability with the capability of the active user', async () => {
    const inherited = encodeFmuContexts([], {
      labId: '42',
      reservationKey: '0xaaa',
      gatewayOrigin: 'https://lite.lab.example',
      resourceSessionId: 'session_identifier_aaaaaaaa',
      expiresAt: Math.floor(Date.now() / 1000) + 300,
      userBinding: createFmuUserBinding({ id: 'user-1' }),
    })
    requireAuth.mockResolvedValue({ id: 'user-2', sessionId: 'b'.repeat(43) })
    const { POST } = await import('../route')

    const response = await POST(new Request('https://marketplace.example.com/api/auth/fmu-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${FMU_CONTEXT_COOKIE}=${inherited.encoded}`,
      },
      body: JSON.stringify({
        accessCode: 'opaque-code',
        labId: '43',
        reservationKey: '0xbbb',
      }),
    }))

    expect(response.status).toBe(200)
    const encoded = response.headers.get('set-cookie').match(/marketplace_fmu_contexts=([^;]+)/)?.[1]
    const storedRequest = new Request('https://marketplace.example.com/api/simulations/history', {
      headers: { Cookie: `${FMU_CONTEXT_COOKIE}=${encoded}` },
    })
    expect(readFmuContexts(storedRequest)).toEqual([
      expect.objectContaining({
        reservationKey: '0xbbb',
        userBinding: createFmuUserBinding({ id: 'user-2' }),
      }),
    ])
  })

  test('rejects a malformed gateway session identifier', async () => {
    gatewayFetch.mockResolvedValue({
      status: 204,
      headers: new Headers({
        'Set-Cookie': 'FMU_SESSION=bad/value; Max-Age=300; Path=/fmu; Secure; HttpOnly; SameSite=Lax',
      }),
    })
    const { POST } = await import('../route')
    const response = await POST(new Request('https://marketplace.example.com/api/auth/fmu-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessCode: 'opaque-code',
        labURL: 'https://lite.lab.example/fmu/',
        labId: '42',
        reservationKey: '0xaaa',
      }),
    }))

    expect(response.status).toBe(502)
    expect(response.headers.get('set-cookie')).toBeNull()
  })
})
