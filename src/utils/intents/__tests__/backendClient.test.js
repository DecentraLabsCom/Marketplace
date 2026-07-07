import {
  mapAuthorizationErrorCode,
  normalizeAuthorizationResponse,
  hasUsableAuthorizationSession,
  resolveAuthorizationUrl,
  notifyIntentRegistrationMined,
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

  test('notifyIntentRegistrationMined posts mined signal with backend auth headers', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: jest.fn().mockResolvedValue({ requestId: 'req-1', status: 'accepted' }),
    })

    const result = await notifyIntentRegistrationMined({
      backendUrl: 'https://ib.example/',
      backendAuthToken: 'backend-token',
      requestId: 'req-1',
      txHash: '0xabc',
      blockNumber: 123,
    })

    expect(global.fetch).toHaveBeenCalledWith(
      'https://ib.example/intents/req-1/registration-mined',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer backend-token',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          event: 'registration_mined',
          txHash: '0xabc',
          blockNumber: 123,
        }),
      }),
    )
    expect(result).toEqual({
      ok: true,
      status: 202,
      body: { requestId: 'req-1', status: 'accepted' },
    })
  })
})
