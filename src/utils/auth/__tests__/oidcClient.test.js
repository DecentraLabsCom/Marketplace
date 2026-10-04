/** @jest-environment node */

jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(),
  jwtVerify: jest.fn(),
}))

import {
  buildEntraAuthorizationUrl,
  createOidcTransaction,
  getEntraRedirectUri,
  safePostLoginRedirect,
} from '@/utils/auth/oidcClient'

describe('OIDC client helpers', () => {
  const originalEnvironment = process.env

  afterEach(() => {
    process.env = originalEnvironment
  })

  test('creates a PKCE transaction and authorization URL', () => {
    const transaction = createOidcTransaction()
    const url = buildEntraAuthorizationUrl({
      clientId: 'client-id',
      authorizationEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    }, { ...transaction, redirectUri: 'https://marketplace.example/api/auth/entra/callback' })
    const params = url.searchParams

    expect(transaction.state).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(transaction.nonce).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(transaction.codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(params.get('client_id')).toBe('client-id')
    expect(params.get('code_challenge_method')).toBe('S256')
    expect(params.get('code_challenge')).toBe(transaction.codeChallenge)
    expect(params.get('redirect_uri')).toBe('https://marketplace.example/api/auth/entra/callback')
  })

  test('uses the configured redirect URI and rejects unsafe post-login paths', () => {
    process.env = { ...originalEnvironment, ENTRA_REDIRECT_URI: 'https://configured.example/callback' }
    expect(getEntraRedirectUri('https://request.example')).toBe('https://configured.example/callback')
    expect(safePostLoginRedirect('/dashboard')).toBe('/dashboard')
    expect(safePostLoginRedirect('https://evil.example')).toBe('/')
    expect(safePostLoginRedirect('//evil.example')).toBe('/')
  })
})
