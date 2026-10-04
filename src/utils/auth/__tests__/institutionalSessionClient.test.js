/** @jest-environment node */

jest.mock('@/utils/auth/institutionalServiceCredential', () => ({
  createInstitutionalServiceToken: jest.fn(),
}))

jest.mock('@/utils/api/gatewayProxy', () => ({
  institutionalBackendFetch: jest.fn(),
  normalizeInstitutionalBackendBaseUrl: jest.fn((value) => value.replace(/\/$/, '')),
}))

import { createInstitutionalServiceToken } from '@/utils/auth/institutionalServiceCredential'
import { institutionalBackendFetch } from '@/utils/api/gatewayProxy'
import {
  createInstitutionalIdentitySession,
  createInstitutionalSessionCredential,
  INSTITUTIONAL_ASSERTION_HASH_VERSION,
  isInstitutionalReauthenticationDue,
} from '../institutionalSessionClient'

describe('institutional session client', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    createInstitutionalServiceToken.mockResolvedValue({ token: 'marketplace-service-token' })
  })

  test('exchanges a fresh assertion for a backend credential without exposing it to intent calls', async () => {
    institutionalBackendFetch.mockResolvedValue(new Response(JSON.stringify({
      sessionToken: 'backend-session-token',
      expiresAt: '2026-08-18T14:00:00.000Z',
      reauthenticationAt: '2026-08-18T14:00:00.000Z',
      samlAssertionHash: `0x${'a'.repeat(64)}`,
      samlAssertionHashVersion: INSTITUTIONAL_ASSERTION_HASH_VERSION,
    }), { status: 200 }))

    const result = await createInstitutionalSessionCredential({
      backendUrl: 'https://backend.example/',
      institutionId: 'uned.es',
      samlAssertion: 'fresh-saml-assertion',
      stableUserIdMode: 'principal',
      puc: 'user@uned.es',
    })

    expect(result.institutionalBackendSessionToken).toBe('backend-session-token')
    expect(result.institutionalBackendSessionExpiresAt).toBe(Date.parse('2026-08-18T14:00:00.000Z'))
    expect(result.samlAssertionHashVersion).toBe(INSTITUTIONAL_ASSERTION_HASH_VERSION)
    expect(createInstitutionalServiceToken).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'intents:session',
      claims: expect.objectContaining({ puc: 'user@uned.es' }),
    }))
    const request = institutionalBackendFetch.mock.calls[0]
    expect(request[0]).toBe('https://backend.example/auth/saml/session')
    expect(JSON.parse(request[1].body)).toEqual({
      samlAssertion: 'fresh-saml-assertion',
      stableUserIdMode: 'principal',
    })
  })

  test('rejects a backend session response using an unsupported assertion hash version', async () => {
    institutionalBackendFetch.mockResolvedValue(new Response(JSON.stringify({
      sessionToken: 'backend-session-token',
      expiresAt: '2026-08-18T14:00:00.000Z',
      reauthenticationAt: '2026-08-18T14:00:00.000Z',
      samlAssertionHash: `0x${'a'.repeat(64)}`,
      samlAssertionHashVersion: 'saml-assertion-c14n-keccak-v1',
    }), { status: 200 }))

    await expect(createInstitutionalSessionCredential({
      backendUrl: 'https://backend.example/',
      institutionId: 'uned.es',
      samlAssertion: 'fresh-saml-assertion',
      stableUserIdMode: 'principal',
      puc: 'user@uned.es',
    })).rejects.toThrow('Unsupported institutional backend assertion hash version')
  })

  test('creates a provider-neutral identity session without sending raw evidence', async () => {
    institutionalBackendFetch.mockResolvedValue(new Response(JSON.stringify({
      sessionToken: 'identity-session-token',
      expiresAt: '2026-08-18T14:00:00.000Z',
      reauthenticationAt: '2026-08-18T14:00:00.000Z',
      identityProtocol: 'oidc',
      identityProvider: 'entra-id',
      identityIssuer: 'https://login.microsoftonline.com/tenant/v2.0',
      identitySubject: 'oid-123',
      identityEvidenceHash: `0x${'b'.repeat(64)}`,
      identityEvidenceHashVersion: 'oidc-id-token-keccak-v1',
    }), { status: 200 }))

    const result = await createInstitutionalIdentitySession({
      backendUrl: 'https://backend.example/',
      institutionId: 'uned.es',
      stableUserIdMode: 'oidc-issuer-sub-v1',
      puc: 'oidc:entra-id:tenant:oid-123',
      identityEvidence: {
        protocol: 'oidc',
        provider: 'entra-id',
        issuer: 'https://login.microsoftonline.com/tenant/v2.0',
        subject: 'oid-123',
        stableUserId: 'oidc:entra-id:tenant:oid-123',
        evidenceHash: `0x${'b'.repeat(64)}`,
        evidenceHashVersion: 'oidc-id-token-keccak-v1',
      },
      externalIdToken: 'eyJhbGciOiJSUzI1NiJ9.external.payload',
      identityNonce: 'nonce-1',
    })

    expect(result).toMatchObject({
      institutionalBackendSessionToken: 'identity-session-token',
      identityProtocol: 'oidc',
      identityEvidenceHashVersion: 'oidc-id-token-keccak-v1',
    })
    expect(institutionalBackendFetch).toHaveBeenCalledWith(
      'https://backend.example/auth/identity/session',
      expect.objectContaining({
        body: JSON.stringify({
          stableUserIdMode: 'oidc-issuer-sub-v1',
          externalIdToken: 'eyJhbGciOiJSUzI1NiJ9.external.payload',
        }),
      }),
    )
    expect(createInstitutionalServiceToken).toHaveBeenCalledWith(expect.objectContaining({
      claims: expect.objectContaining({
        identityProtocol: 'oidc',
        identityEvidenceHashVersion: 'oidc-id-token-keccak-v1',
        identityNonce: 'nonce-1',
      }),
    }))
    expect(createInstitutionalServiceToken.mock.calls[0][0].claims.rawEvidence).toBeUndefined()
  })

  test('marks the five-minute reauthentication window as due', () => {
    const now = Date.parse('2026-08-18T13:55:00.000Z')
    expect(isInstitutionalReauthenticationDue({
      institutionalReauthenticationAt: Date.parse('2026-08-18T14:00:00.000Z'),
    }, now)).toBe(true)
    expect(isInstitutionalReauthenticationDue({
      institutionalReauthenticationAt: Date.parse('2026-08-18T14:05:01.000Z'),
    }, now)).toBe(false)
  })
})
