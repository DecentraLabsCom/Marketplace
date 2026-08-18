import {
  resolveSessionReauthenticationAt,
  resolveSessionTtlSeconds,
} from '../sessionConfig'

describe('sessionConfig', () => {
  const now = Date.parse('2026-08-18T10:00:00.000Z')

  test('uses the backend credential horizon instead of the shorter raw assertion horizon', () => {
    expect(resolveSessionTtlSeconds({
      samlAssertionExpiresAt: now + 30 * 60 * 1000,
      institutionalBackendSessionExpiresAt: now + 90 * 60 * 1000,
    }, 60 * 60, now)).toBe(60 * 60)
  })

  test('caps legacy sessions at the raw SAML assertion expiry', () => {
    expect(resolveSessionTtlSeconds({
      samlAssertionExpiresAt: now + 30 * 60 * 1000,
    }, 60 * 60, now)).toBe(29 * 60)
  })

  test('caps the session at an earlier backend credential expiry', () => {
    expect(resolveSessionTtlSeconds({
      samlAssertionExpiresAt: now + 90 * 60 * 1000,
      institutionalBackendSessionExpiresAt: now + 30 * 60 * 1000,
    }, 60 * 60, now)).toBe(30 * 60)
  })

  test('uses the backend credential reauthentication horizon for active SSO users', () => {
    expect(resolveSessionReauthenticationAt({
      samlAssertionExpiresAt: now + 20 * 60 * 1000,
      institutionalReauthenticationAt: now + 50 * 60 * 1000,
      institutionalBackendSessionExpiresAt: now + 60 * 60 * 1000,
    })).toBe(now + 50 * 60 * 1000)

    expect(resolveSessionReauthenticationAt({
      samlAssertionExpiresAt: now + 50 * 60 * 1000,
      institutionalReauthenticationAt: now + 20 * 60 * 1000,
      institutionalBackendSessionExpiresAt: now + 60 * 60 * 1000,
    })).toBe(now + 20 * 60 * 1000)
  })
})
