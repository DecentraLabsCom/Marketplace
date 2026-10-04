/** @jest-environment node */

jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}))
jest.mock('@/utils/auth/sso', () => ({
  createSession: jest.fn(),
}))
jest.mock('@/utils/auth/identityEvidence', () => ({
  buildIdentityEvidence: jest.fn(),
}))
jest.mock('@/utils/auth/oidcClient', () => ({
  clearOidcTransactionCookies: jest.fn(),
  exchangeEntraCode: jest.fn(),
  getEntraOidcConfig: jest.fn(),
  getEntraRedirectUri: jest.fn(),
  safePostLoginRedirect: jest.fn(),
  verifyEntraIdToken: jest.fn(),
}))
jest.mock('@/utils/auth/oidcTransactionStore', () => ({
  consumeOidcTransaction: jest.fn(),
}))
jest.mock('@/utils/auth/entraIdAdapter', () => ({
  buildCanonicalPrincipalFromEntra: jest.fn(),
  principalToSessionData: jest.fn(),
}))
jest.mock('@/utils/onboarding/institutionalBackend', () => ({
  resolveInstitutionalBackendUrl: jest.fn(),
}))
jest.mock('@/utils/auth/institutionalSessionClient', () => ({
  createInstitutionalIdentitySession: jest.fn(),
}))
jest.mock('@/utils/dev/logger', () => ({
  warn: jest.fn(),
}))

import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import { createSession } from '@/utils/auth/sso'
import { buildIdentityEvidence } from '@/utils/auth/identityEvidence'
import {
  clearOidcTransactionCookies,
  exchangeEntraCode,
  getEntraOidcConfig,
  getEntraRedirectUri,
  safePostLoginRedirect,
  verifyEntraIdToken,
} from '@/utils/auth/oidcClient'
import { consumeOidcTransaction } from '@/utils/auth/oidcTransactionStore'
import {
  buildCanonicalPrincipalFromEntra,
  principalToSessionData,
} from '@/utils/auth/entraIdAdapter'
import { resolveInstitutionalBackendUrl } from '@/utils/onboarding/institutionalBackend'
import { createInstitutionalIdentitySession } from '@/utils/auth/institutionalSessionClient'
import { GET } from './route'

describe('Entra callback route', () => {
  const transaction = {
    state: 'state-1',
    nonce: 'nonce-1',
    codeVerifier: 'verifier-1',
    redirectUri: 'https://marketplace.example/api/auth/entra/callback',
    provider: 'entra-id',
  }

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.ENTRA_POST_LOGIN_REDIRECT = '/dashboard'
    cookies.mockResolvedValue({ get: jest.fn(() => ({ value: 'state-1' })) })
    consumeOidcTransaction.mockResolvedValue(transaction)
    getEntraOidcConfig.mockResolvedValue({ clientId: 'client-1' })
    getEntraRedirectUri.mockReturnValue(transaction.redirectUri)
    exchangeEntraCode.mockResolvedValue('id-token')
    verifyEntraIdToken.mockResolvedValue({
      iss: 'https://login.microsoftonline.com/tenant-1/v2.0',
      tid: 'tenant-1',
      oid: 'oid-123',
      sub: 'pairwise-subject',
      iat: 1_700_000_000,
      exp: 1_700_003_600,
    })
    buildCanonicalPrincipalFromEntra.mockReturnValue({
      sub: 'oidc:entra-id:tenant-1:oid-123',
      externalIssuer: 'https://login.microsoftonline.com/tenant-1/v2.0',
      externalSubject: 'oid-123',
      institutionId: 'uned.es',
    })
    buildIdentityEvidence.mockReturnValue({
      protocol: 'oidc',
      provider: 'entra-id',
      issuer: 'https://login.microsoftonline.com/tenant-1/v2.0',
      subject: 'oid-123',
      stableUserId: 'oidc:entra-id:tenant-1:oid-123',
      institutionId: 'uned.es',
      evidenceHash: `0x${'a'.repeat(64)}`,
      evidenceHashVersion: 'oidc-id-token-keccak-v1',
    })
    resolveInstitutionalBackendUrl.mockResolvedValue('https://backend.example')
    createInstitutionalIdentitySession.mockResolvedValue({
      institutionalBackendSessionToken: 'backend-session',
      institutionalBackendSessionExpiresAt: Date.parse('2026-10-04T02:00:00Z'),
    })
    principalToSessionData.mockReturnValue({ authType: 'sso' })
    safePostLoginRedirect.mockReturnValue('/dashboard')
  })

  afterEach(() => {
    delete process.env.ENTRA_POST_LOGIN_REDIRECT
  })

  test('validates and exchanges a one-time transaction without putting the ID token in the browser session', async () => {
    const response = await GET(new NextRequest(
      'https://marketplace.example/api/auth/entra/callback?code=code-1&state=state-1',
    ))

    expect(response.status).toBe(303)
    expect(consumeOidcTransaction).toHaveBeenCalledWith('state-1', 'entra-id')
    expect(exchangeEntraCode).toHaveBeenCalledWith(expect.anything(), {
      code: 'code-1',
      codeVerifier: 'verifier-1',
      redirectUri: transaction.redirectUri,
    })
    expect(verifyEntraIdToken).toHaveBeenCalledWith(expect.anything(), 'id-token', 'nonce-1')
    expect(createInstitutionalIdentitySession).toHaveBeenCalledWith(expect.objectContaining({
      externalIdToken: 'id-token',
    }))
    expect(createSession).toHaveBeenCalledWith(expect.anything(), expect.not.objectContaining({
      idToken: expect.anything(),
      externalIdToken: expect.anything(),
    }))
    expect(clearOidcTransactionCookies).toHaveBeenCalled()
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  test('rejects a replayed or unknown transaction before contacting Entra', async () => {
    consumeOidcTransaction.mockResolvedValue(null)

    const response = await GET(new NextRequest(
      'https://marketplace.example/api/auth/entra/callback?code=code-1&state=state-1',
    ))

    expect(response.status).toBe(303)
    expect(exchangeEntraCode).not.toHaveBeenCalled()
    expect(createSession).not.toHaveBeenCalled()
  })
})
