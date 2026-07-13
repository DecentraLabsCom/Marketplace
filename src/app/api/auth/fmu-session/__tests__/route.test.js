/**
 * @jest-environment node
 */

import { requireAuth } from '@/utils/auth/guards'
import { gatewayFetch, resolveGatewayBaseUrl } from '@/utils/api/gatewayProxy'

jest.mock('@/utils/auth/guards', () => {
  const actual = jest.requireActual('@/utils/auth/guards')
  return { ...actual, requireAuth: jest.fn() }
})

jest.mock('@/utils/api/gatewayProxy', () => ({
  gatewayFetch: jest.fn(),
  resolveGatewayBaseUrl: jest.fn(),
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
    requireAuth.mockResolvedValue({ id: 'user-1' })
    resolveGatewayBaseUrl.mockResolvedValue('https://gateway.example.com')
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
        labURL: 'https://gateway.example.com/fmu/',
        labId: '42',
        reservationKey: '0xaaa',
      }),
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ gatewayOrigin: 'https://gateway.example.com' })
    expect(gatewayFetch).toHaveBeenCalledWith(
      'https://gateway.example.com/auth/access',
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
  })

  test('rejects a labURL whose origin differs from the on-chain gateway', async () => {
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
        labURL: 'https://gateway.example.com/fmu/',
        labId: '42',
        reservationKey: '0xaaa',
      }),
    }))

    expect(response.status).toBe(502)
    expect(response.headers.get('set-cookie')).toBeNull()
  })
})
