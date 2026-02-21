jest.mock('@/utils/intents/pollIntentAuthorizationStatus', () => jest.fn())

jest.mock('@/utils/browser/popupBlockerGuidance', () => ({
  createPopupBlockedError: jest.fn(() => {
    const error = new Error('Popup blocked')
    error.code = 'INTENT_AUTH_POPUP_BLOCKED'
    return error
  }),
  emitPopupBlockedEvent: jest.fn(),
}))

import pollIntentAuthorizationStatus from '@/utils/intents/pollIntentAuthorizationStatus'
import { emitPopupBlockedEvent } from '@/utils/browser/popupBlockerGuidance'
import {
  awaitIntentAuthorization,
  pollIntentPresence,
  resolveAuthorizationStatusBaseUrl,
} from '../authorizationOrchestrator'

describe('authorizationOrchestrator', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useRealTimers()
    global.fetch = jest.fn()
    window.open = jest.fn(() => ({
      closed: false,
      focus: jest.fn(),
      close: jest.fn(),
      opener: null,
    }))
  })

  test('resolveAuthorizationStatusBaseUrl returns parsed origin', () => {
    expect(
      resolveAuthorizationStatusBaseUrl(
        'https://institution.example/intents/authorize/session-1',
        'https://fallback.example'
      )
    ).toBe('https://institution.example')
  })

  test('pollIntentPresence returns present when backend has the intent', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, status: 200 })

    const status = await pollIntentPresence('req-1', {
      backendUrl: 'https://institution.example',
      authToken: 'token-1',
    })

    expect(status).toBe('present')
    expect(global.fetch).toHaveBeenCalledWith(
      'https://institution.example/intents/req-1',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-1',
        }),
      })
    )
  })

  test('pollIntentPresence stops early on unexpected 4xx when configured', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 400 })

    const status = await pollIntentPresence('req-2', {
      backendUrl: 'https://institution.example',
      stopOnUnexpected4xx: true,
    })

    expect(status).toBe('unknown')
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  test('pollIntentPresence keeps polling on unexpected 4xx when stopOnUnexpected4xx is false', async () => {
    jest.useFakeTimers()
    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 400 })
      .mockResolvedValueOnce({ ok: false, status: 401 })

    const promise = pollIntentPresence('req-3', {
      backendUrl: 'https://institution.example',
      stopOnUnexpected4xx: false,
      maxDurationMs: 1000,
      initialDelayMs: 100,
      maxDelayMs: 100,
    })

    await jest.advanceTimersByTimeAsync(150)
    const status = await promise

    expect(status).toBe('unknown')
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  test('awaitIntentAuthorization returns SUCCESS and closes popup in finally when configured', async () => {
    const popup = { closed: false, focus: jest.fn(), close: jest.fn(), opener: null }
    window.open = jest.fn(() => popup)
    pollIntentAuthorizationStatus.mockResolvedValueOnce({
      status: 'SUCCESS',
      requestId: 'req-auth-1',
    })

    const result = await awaitIntentAuthorization({
      authorizationUrl: 'https://institution.example/intents/authorize/session-1',
      authorizationSessionId: 'session-1',
      backendUrl: 'https://institution.example',
      intent: { meta: { requestId: 'req-auth-1' } },
    }, {
      closePopupInFinally: true,
      source: 'booking-intent-authorization',
    })

    expect(result).toMatchObject({ status: 'SUCCESS', requestId: 'req-auth-1' })
    expect(popup.close).toHaveBeenCalledTimes(1)
  })

  test('awaitIntentAuthorization throws popup blocked error and emits blocker event', async () => {
    window.open = jest.fn(() => null)

    await expect(awaitIntentAuthorization({
      authorizationUrl: 'https://institution.example/intents/authorize/session-2',
      authorizationSessionId: 'session-2',
      backendUrl: 'https://institution.example',
      intent: { meta: { requestId: 'req-auth-2' } },
    }, {
      source: 'lab-intent-authorization',
    })).rejects.toMatchObject({ code: 'INTENT_AUTH_POPUP_BLOCKED' })

    expect(emitPopupBlockedEvent).toHaveBeenCalledWith(expect.objectContaining({
      source: 'lab-intent-authorization',
    }))
  })

  test('awaitIntentAuthorization uses presence fallback when popup closes before status arrives', async () => {
    jest.useFakeTimers()
    const popup = { closed: false, focus: jest.fn(), close: jest.fn(), opener: null }
    window.open = jest.fn(() => popup)
    pollIntentAuthorizationStatus.mockImplementationOnce(() => new Promise(() => {}))
    const presenceFn = jest.fn(async () => 'present')

    const promise = awaitIntentAuthorization({
      authorizationUrl: 'https://institution.example/intents/authorize/session-3',
      authorizationSessionId: 'session-3',
      backendUrl: 'https://institution.example',
      intent: { meta: { requestId: 'req-auth-3' } },
    }, {
      presenceFn,
      source: 'lab-intent-authorization',
      closePopupInFinally: false,
      stopOnUnexpected4xx: true,
    })

    popup.closed = true
    await jest.advanceTimersByTimeAsync(1400)
    const result = await promise

    expect(result).toMatchObject({
      status: 'SUCCESS',
      requestId: 'req-auth-3',
    })
    expect(presenceFn).toHaveBeenCalledWith('req-auth-3', expect.objectContaining({
      stopOnUnexpected4xx: true,
    }))
  })

  test('awaitIntentAuthorization preserves lab behavior: FAILED throws before closing popup when closePopupInFinally=false', async () => {
    const popup = { closed: false, focus: jest.fn(), close: jest.fn(), opener: null }
    window.open = jest.fn(() => popup)
    pollIntentAuthorizationStatus.mockResolvedValueOnce({
      status: 'FAILED',
      error: 'Denied by backend',
      requestId: 'req-auth-4',
    })

    await expect(awaitIntentAuthorization({
      authorizationUrl: 'https://institution.example/intents/authorize/session-4',
      authorizationSessionId: 'session-4',
      backendUrl: 'https://institution.example',
      intent: { meta: { requestId: 'req-auth-4' } },
    }, {
      closePopupInFinally: false,
      source: 'lab-intent-authorization',
    })).rejects.toThrow('Denied by backend')

    expect(popup.close).not.toHaveBeenCalled()
  })

  test('awaitIntentAuthorization preserves booking behavior: FAILED still closes popup when closePopupInFinally=true', async () => {
    const popup = { closed: false, focus: jest.fn(), close: jest.fn(), opener: null }
    window.open = jest.fn(() => popup)
    pollIntentAuthorizationStatus.mockResolvedValueOnce({
      status: 'FAILED',
      error: 'Denied by backend',
      requestId: 'req-auth-5',
    })

    await expect(awaitIntentAuthorization({
      authorizationUrl: 'https://institution.example/intents/authorize/session-5',
      authorizationSessionId: 'session-5',
      backendUrl: 'https://institution.example',
      intent: { meta: { requestId: 'req-auth-5' } },
    }, {
      closePopupInFinally: true,
      source: 'booking-intent-authorization',
    })).rejects.toThrow('Denied by backend')

    expect(popup.close).toHaveBeenCalledTimes(1)
  })
})
