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
  createInstitutionalSessionCredential,
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
