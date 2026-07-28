/**
 * @jest-environment node
 */

import { resolveLabAccessGateway } from '@/utils/api/gatewayProxy'
import { POST } from '../route'

jest.mock('@/utils/api/gatewayProxy', () => {
  const actual = jest.requireActual('@/utils/api/gatewayProxy')
  return {
    ...actual,
    resolveLabAccessGateway: jest.fn(),
  }
})

jest.mock('@/utils/api/rateLimit', () => ({
  createRateLimiter: jest.fn(() => jest.fn(async () => ({ limited: false }))),
  createRateLimitResponse: jest.fn(() => null),
}))

function buildRequest(body, headers = {}) {
  return new Request('https://marketplace.example/api/auth/lab-access/handoff', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: 'https://marketplace.example',
      ...headers,
    },
    body: new URLSearchParams(body),
  })
}

describe('POST /api/auth/lab-access/handoff', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resolveLabAccessGateway.mockResolvedValue('https://sarlab.dia.uned.es')
  })

  test('returns a no-store dynamic handoff document for the on-chain gateway', async () => {
    const response = await POST(buildRequest({
      lab_id: '42',
      access_code: 'opaque-code',
    }))

    const html = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
    expect(response.headers.get('Content-Security-Policy')).toContain(
      "form-action 'self' https://sarlab.dia.uned.es",
    )
    expect(response.headers.get('Content-Security-Policy')).toContain("script-src 'nonce-")
    expect(html).toContain('action="https://sarlab.dia.uned.es/auth/access"')
    expect(html).toContain('name="access_code" value="opaque-code"')
    expect(html).toContain("document.getElementById('lab-access-handoff').submit()")
    expect(resolveLabAccessGateway).toHaveBeenCalledWith({ labId: '42' })
  })

  test('rejects malformed access handoff input before resolving a gateway', async () => {
    const response = await POST(buildRequest({
      lab_id: 'not-a-lab',
      access_code: 'opaque-code',
    }))

    expect(response.status).toBe(400)
    expect(resolveLabAccessGateway).not.toHaveBeenCalled()
  })

  test('rejects multipart or JSON handoff bodies', async () => {
    const response = await POST(buildRequest(
      { lab_id: '42', access_code: 'opaque-code' },
      { 'Content-Type': 'application/json' },
    ))

    expect(response.status).toBe(400)
    expect(resolveLabAccessGateway).not.toHaveBeenCalled()
  })

  test('rejects a cross-origin browser submission', async () => {
    const response = await POST(buildRequest(
      { lab_id: '42', access_code: 'opaque-code' },
      { Origin: 'https://attacker.example' },
    ))

    expect(response.status).toBe(403)
    expect(resolveLabAccessGateway).not.toHaveBeenCalled()
  })

  test('accepts the public origin when the request passed through a reverse proxy', async () => {
    const request = new Request('http://marketplace-internal/api/auth/lab-access/handoff', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: 'https://marketplace.example',
        Host: 'marketplace.example',
        'X-Forwarded-Proto': 'https',
      },
      body: new URLSearchParams({
        lab_id: '42',
        access_code: 'opaque-code',
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
  })

  test('accepts a browser same-origin handoff when the hosting URL is internal', async () => {
    const response = await POST(new Request('http://marketplace-internal/api/auth/lab-access/handoff', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: 'https://marketplace.example',
        'Sec-Fetch-Site': 'same-origin',
      },
      body: new URLSearchParams({
        lab_id: '42',
        access_code: 'opaque-code',
      }),
    }))

    expect(response.status).toBe(200)
  })

  test('rejects a browser cross-site handoff even when the origin is unavailable', async () => {
    const response = await POST(buildRequest(
      { lab_id: '42', access_code: 'opaque-code' },
      { Origin: 'https://marketplace.example', 'Sec-Fetch-Site': 'cross-site' },
    ))

    expect(response.status).toBe(403)
    expect(resolveLabAccessGateway).not.toHaveBeenCalled()
  })

  test('fails closed for an HTTP gateway in production', async () => {
    const originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    resolveLabAccessGateway.mockResolvedValue('http://lab.example')

    try {
      const response = await POST(buildRequest({
        lab_id: '42',
        access_code: 'opaque-code',
      }))

      expect(response.status).toBe(400)
    } finally {
      process.env.NODE_ENV = originalNodeEnv
    }
  })
})
