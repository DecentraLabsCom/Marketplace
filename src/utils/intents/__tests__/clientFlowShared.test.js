jest.mock('@/utils/onboarding/browserCredentialMarker', () => ({
  markBrowserCredentialVerified: jest.fn(),
}))

import { markBrowserCredentialVerified } from '@/utils/onboarding/browserCredentialMarker'
import {
  resolveIntentRequestId,
  createIntentMutationError,
  createAuthorizationCancelledError,
  createAuthorizationNotConfirmedError,
  createAuthorizationSessionUnavailableError,
  isIntentAuthorizationConfirmed,
  markBrowserCredentialVerifiedFromIntent,
  normalizeAuthorizationUrl,
  resolveAuthorizationInfo,
  openAuthorizationPopup,
  openPendingAuthorizationPopup,
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
    expect(createAuthorizationNotConfirmedError().code).toBe('INTENT_AUTH_NOT_CONFIRMED')
    expect(createAuthorizationSessionUnavailableError().code).toBe('INTENT_AUTH_SESSION_UNAVAILABLE')
  })

  test('only explicit authorization statuses are considered confirmed', () => {
    expect(isIntentAuthorizationConfirmed('SUCCESS')).toBe(true)
    expect(isIntentAuthorizationConfirmed('AUTHORIZED')).toBe(true)
    expect(isIntentAuthorizationConfirmed('PENDING_AUTHORIZATION')).toBe(false)
    expect(isIntentAuthorizationConfirmed('UNKNOWN')).toBe(false)
    expect(isIntentAuthorizationConfirmed('EXECUTED')).toBe(false)
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

  test('openPendingAuthorizationPopup opens a waiting window with status content', () => {
    const popup = {
      closed: false,
      document: {
        open: jest.fn(),
        write: jest.fn(),
        close: jest.fn(),
      },
      focus: jest.fn(),
    }
    window.open = jest.fn(() => popup)

    const result = openPendingAuthorizationPopup()

    expect(result).toBe(popup)
    expect(window.open).toHaveBeenCalledWith('', 'intent-authorization', 'width=480,height=720')
    expect(popup.document.write).toHaveBeenCalledWith(expect.stringContaining('Preparing authorization'))
    expect(popup.focus).toHaveBeenCalled()
  })

  test('openAuthorizationPopup navigates an existing pending popup', () => {
    const popup = {
      closed: false,
      focus: jest.fn(),
      location: { href: 'about:blank' },
      opener: {},
    }
    window.open = jest.fn()

    const result = openAuthorizationPopup(
      'https://ib.example/intents/authorize/ceremony/session-1',
      popup,
      { keepOpener: true }
    )

    expect(result).toBe(popup)
    expect(window.open).not.toHaveBeenCalled()
    expect(popup.location.href).toBe('https://ib.example/intents/authorize/ceremony/session-1')
    expect(popup.focus).toHaveBeenCalled()
  })
})
