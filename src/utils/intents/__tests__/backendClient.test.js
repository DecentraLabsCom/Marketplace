import {
  mapAuthorizationErrorCode,
  normalizeAuthorizationResponse,
  hasUsableAuthorizationSession,
  resolveAuthorizationUrl,
} from '../backendClient'

describe('backendClient', () => {
  test('mapAuthorizationErrorCode maps known backend errors', () => {
    expect(mapAuthorizationErrorCode('webauthn_credential_not_registered')).toBe('WEBAUTHN_CREDENTIAL_NOT_REGISTERED')
    expect(mapAuthorizationErrorCode('missing_puc_for_webauthn')).toBe('MISSING_PUC_FOR_WEBAUTHN')
    expect(mapAuthorizationErrorCode('unknown_error')).toBeNull()
    expect(mapAuthorizationErrorCode(null)).toBeNull()
  })

  test('normalizeAuthorizationResponse supports nested and snake_case payloads', () => {
    const normalized = normalizeAuthorizationResponse({
      data: {
        session_id: 'session-1',
        ceremony_url: 'https://ib.example/intents/authorize/ceremony/session-1',
        expires_at: '2026-02-20T10:00:00Z',
      },
    })

    expect(normalized).toEqual({
      sessionId: 'session-1',
      ceremonyUrl: 'https://ib.example/intents/authorize/ceremony/session-1',
      authorizationUrl: null,
      expiresAt: '2026-02-20T10:00:00Z',
    })
  })

  test('hasUsableAuthorizationSession requires at least one usable field', () => {
    expect(hasUsableAuthorizationSession({ sessionId: 'session-1' })).toBe(true)
    expect(hasUsableAuthorizationSession({ ceremonyUrl: 'https://ib.example/ceremony' })).toBe(true)
    expect(hasUsableAuthorizationSession({ authorizationUrl: 'https://ib.example/auth' })).toBe(true)
    expect(hasUsableAuthorizationSession({ sessionId: null, ceremonyUrl: null, authorizationUrl: null })).toBe(false)
  })

  test('resolveAuthorizationUrl falls back to ceremony URL built from session id', () => {
    expect(
      resolveAuthorizationUrl('https://ib.example/', { sessionId: 'session-42' })
    ).toBe('https://ib.example/intents/authorize/ceremony/session-42')
  })
})
