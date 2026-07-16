import { buildContentSecurityPolicy } from '../contentSecurityPolicy'
import { getSecurityHeaders } from '../securityHeaders'

describe('browser security policy', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  test('builds a production CSP with a per-request nonce and restrictive frame policy', () => {
    const policy = buildContentSecurityPolicy({ nonce: 'nonce-value' })

    expect(policy).toContain("script-src 'self' 'nonce-nonce-value' 'strict-dynamic'")
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'")
    expect(policy).toContain("frame-ancestors 'none'")
    expect(policy).toContain("frame-src 'self'")
    expect(policy).toContain('object-src \'none\'')
    expect(policy).toContain('upgrade-insecure-requests')
    expect(policy).not.toContain('unsafe-eval')
  })

  test('accepts deployment-supplied exact origins for dynamic browser connections and frames', () => {
    process.env.CSP_CONNECT_SRC = 'https://institution.example,https://rpc.example'
    process.env.CSP_FRAME_SRC = 'https://docs.example'

    const policy = buildContentSecurityPolicy({ nonce: 'nonce-value' })

    expect(policy).toContain('connect-src \'self\' https://institution.example https://rpc.example')
    expect(policy).toContain("frame-src 'self' https://docs.example")
    expect(policy).not.toContain('connect-src \'self\' https: wss:')
  })

  test('permits local development evaluation but never enables HSTS there', () => {
    const policy = buildContentSecurityPolicy({ nonce: 'nonce-value', isDevelopment: true })
    expect(policy).toContain("'unsafe-eval'")
    expect(policy).toContain("style-src-elem 'self' 'unsafe-inline'")
    expect(policy).not.toContain('upgrade-insecure-requests')
    expect(getSecurityHeaders({ isProduction: false })).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'Strict-Transport-Security' })]),
    )
  })

  test('uses the request nonce for production style elements', () => {
    const policy = buildContentSecurityPolicy({ nonce: 'nonce-value' })
    expect(policy).toContain("style-src 'self' 'nonce-nonce-value'")
    expect(policy).toContain("style-src-elem 'self' 'nonce-nonce-value'")
    expect(policy).not.toContain("style-src-elem 'self' 'unsafe-inline'")
  })

  test('adds HSTS and baseline defensive headers in production', () => {
    expect(getSecurityHeaders({ isProduction: true })).toEqual(expect.arrayContaining([
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      expect.objectContaining({ key: 'Permissions-Policy' }),
    ]))
  })
})

