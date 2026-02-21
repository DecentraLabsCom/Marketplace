jest.mock('@/utils/onboarding/browserCredentialMarker', () => ({
  markBrowserCredentialVerified: jest.fn(),
}))

import { markBrowserCredentialVerified } from '@/utils/onboarding/browserCredentialMarker'
import {
  resolveIntentRequestId,
  createIntentMutationError,
  createAuthorizationCancelledError,
  createAuthorizationSessionUnavailableError,
  markBrowserCredentialVerifiedFromIntent,
  normalizeAuthorizationUrl,
  resolveAuthorizationInfo,
} from '../clientFlowShared'

describe('clientFlowShared', () => {
  beforeEach(() => {
    markBrowserCredentialVerified.mockClear()
  })

  test('resolveIntentRequestId supports legacy payload formats', () => {
    expect(resolveIntentRequestId({ requestId: 'direct-1' })).toBe('direct-1')
    expect(resolveIntentRequestId({ intent: { meta: { requestId: 'meta-1' } } })).toBe('meta-1')
    expect(resolveIntentRequestId({ intent: { request_id: 'snake-1' } })).toBe('snake-1')
  })

  test('createIntentMutationError preserves code', () => {
    const error = createIntentMutationError({ error: 'boom', code: 'ERR_CODE' }, 'fallback')
    expect(error.message).toBe('boom')
    expect(error.code).toBe('ERR_CODE')
  })

  test('createAuthorization errors set stable codes', () => {
    expect(createAuthorizationCancelledError().code).toBe('INTENT_AUTH_CANCELLED')
    expect(createAuthorizationSessionUnavailableError().code).toBe('INTENT_AUTH_SESSION_UNAVAILABLE')
  })

  test('normalizeAuthorizationUrl rebuilds malformed intents host against backend URL', () => {
    const url = normalizeAuthorizationUrl(
      'https://intents/authorize/ceremony/session-7',
      'https://ib.example'
    )
    expect(url).toBe('https://ib.example/intents/authorize/ceremony/session-7')
  })

  test('resolveAuthorizationInfo reads ceremony URL and session id', () => {
    const info = resolveAuthorizationInfo(
      {
        ceremonyUrl: '/intents/authorize/ceremony/session-8',
        authorizationSessionId: 'session-8',
        backendUrl: 'https://ib.example',
      },
      null
    )

    expect(info).toEqual({
      authorizationUrl: 'https://ib.example/intents/authorize/ceremony/session-8',
      authorizationSessionId: 'session-8',
    })
  })

  test('markBrowserCredentialVerifiedFromIntent includes reservation payload only when requested', () => {
    const prepareData = {
      intent: {
        reservationPayload: {
          puc: 'user-123',
          schacHomeOrganization: 'org.example',
        },
      },
    }

    markBrowserCredentialVerifiedFromIntent(prepareData)
    expect(markBrowserCredentialVerified).not.toHaveBeenCalled()

    markBrowserCredentialVerifiedFromIntent(prepareData, { includeReservationPayload: true })
    expect(markBrowserCredentialVerified).toHaveBeenCalledWith({
      stableUserId: 'user-123',
      institutionId: 'org.example',
    })
  })
})
