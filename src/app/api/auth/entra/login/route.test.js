/** @jest-environment node */

jest.mock('@/utils/auth/oidcClient', () => ({
  buildEntraAuthorizationUrl: jest.fn(),
  createOidcTransaction: jest.fn(),
  getEntraOidcConfig: jest.fn(),
  getEntraRedirectUri: jest.fn(),
}))
jest.mock('@/utils/auth/oidcTransactionStore', () => ({
  saveOidcTransaction: jest.fn(),
}))
jest.mock('@/utils/dev/logger', () => ({
  error: jest.fn(),
}))

import { NextRequest } from 'next/server'
import {
  buildEntraAuthorizationUrl,
  createOidcTransaction,
  getEntraOidcConfig,
  getEntraRedirectUri,
} from '@/utils/auth/oidcClient'
import { saveOidcTransaction } from '@/utils/auth/oidcTransactionStore'
import { GET } from './route'

describe('Entra login route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    createOidcTransaction.mockReturnValue({
      state: 'state-1',
      nonce: 'nonce-1',
      codeVerifier: 'verifier-1',
      codeChallenge: 'challenge-1',
    })
    getEntraOidcConfig.mockResolvedValue({ clientId: 'client-1' })
    getEntraRedirectUri.mockReturnValue('https://marketplace.example/api/auth/entra/callback')
    buildEntraAuthorizationUrl.mockReturnValue(new URL('https://login.microsoftonline.com/authorize'))
  })

  test('stores the PKCE transaction server-side and sets only the double-submit state cookie', async () => {
    const response = await GET(new NextRequest('https://marketplace.example/api/auth/entra/login'))

    expect(response.status).toBe(307)
    expect(saveOidcTransaction).toHaveBeenCalledWith(expect.objectContaining({
      state: 'state-1',
      nonce: 'nonce-1',
      codeVerifier: 'verifier-1',
      provider: 'entra-id',
      redirectUri: 'https://marketplace.example/api/auth/entra/callback',
    }), 300)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const setCookie = response.headers.get('set-cookie')
    expect(setCookie).toContain('entra_oidc_state=state-1')
    expect(setCookie).not.toContain('entra_oidc_nonce=')
    expect(setCookie).not.toContain('entra_oidc_verifier=')
  })
})
