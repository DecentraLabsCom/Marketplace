import pollIntentAuthorizationStatus from '@/utils/intents/pollIntentAuthorizationStatus'
import {
  createAuthorizationSessionUnavailableError,
  resolveAuthorizationInfo,
  resolveIntentRequestId,
  openAuthorizationPopup,
  openAuthorizationPopupFallback,
} from '@/utils/intents/clientFlowShared'
import {
  createPopupBlockedError,
  emitPopupBlockedEvent,
} from '@/utils/browser/popupBlockerGuidance'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const closePopupSafely = (popup) => {
  try {
    if (popup && !popup.closed) {
      popup.close()
    }
  } catch {
    // ignore close errors
  }
}

export const resolveAuthorizationStatusBaseUrl = (authorizationUrl, backendUrl) => {
  if (!authorizationUrl && !backendUrl) return null
  try {
    const parsed = new URL(authorizationUrl || '', backendUrl || undefined)
    return parsed.origin
  } catch {
    return backendUrl || null
  }
}

export const pollIntentPresence = async (requestId, {
  backendUrl,
  authToken,
  maxDurationMs = 2500,
  initialDelayMs = 300,
  maxDelayMs = 800,
  stopOnUnexpected4xx = false,
} = {}) => {
  if (!backendUrl || !requestId) return 'unknown'

  let delay = initialDelayMs
  const start = Date.now()
  const normalizedBackend = backendUrl.replace(/\/$/, '')

  while (Date.now() - start <= maxDurationMs) {
    try {
      const headers = { 'Content-Type': 'application/json' }
      if (typeof authToken === 'string' && authToken.trim().length > 0) {
        const value = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`
        headers.Authorization = value
      }
      const res = await fetch(`${normalizedBackend}/intents/${requestId}`, {
        method: 'GET',
        headers,
      })
      if (res.ok) {
        return 'present'
      }
      if (res.status === 404) {
        return 'absent'
      }
      if (res.status === 401 || res.status === 403) {
        return 'unknown'
      }
      if (stopOnUnexpected4xx && res.status >= 400 && res.status < 500) {
        return 'unknown'
      }
    } catch {
      // Ignore transient errors and keep polling.
    }

    await sleep(delay)
    delay = Math.min(delay * 1.5, maxDelayMs)
  }

  return 'unknown'
}

export async function awaitIntentAuthorization(prepareData, {
  backendUrl,
  authToken,
  popup,
  presenceFn,
  source = 'intent-authorization',
  requestIdResolver = resolveIntentRequestId,
  resolveStatusBackendUrl,
  closePopupInFinally = false,
  stopOnUnexpected4xx = false,
} = {}) {
  const { authorizationUrl, authorizationSessionId } = resolveAuthorizationInfo(prepareData, backendUrl)
  if (!authorizationUrl || !authorizationSessionId) {
    closePopupSafely(popup)
    throw createAuthorizationSessionUnavailableError('Authorization session unavailable')
  }

  let authPopup = openAuthorizationPopup(authorizationUrl, popup, { keepOpener: true })
  if (!authPopup) {
    authPopup = openAuthorizationPopupFallback(authorizationUrl, { keepOpener: true })
  }
  if (!authPopup) {
    emitPopupBlockedEvent({
      authorizationUrl,
      source,
    })
    throw createPopupBlockedError()
  }

  const statusBackendUrl = typeof resolveStatusBackendUrl === 'function'
    ? resolveStatusBackendUrl(authorizationUrl, prepareData, backendUrl)
    : (prepareData?.backendUrl || backendUrl)

  let closeInterval = null
  let messageHandler = null
  const expectedOrigin = (() => {
    try {
      return authorizationUrl ? new URL(authorizationUrl).origin : null
    } catch {
      return null
    }
  })()
  const messagePromise = new Promise((resolve) => {
    messageHandler = (event) => {
      if (expectedOrigin && event.origin !== expectedOrigin) return
      const payload = event?.data
      if (!payload || payload.type !== 'intent-authorization') return
      resolve({
        __message: true,
        status: payload.status,
        requestId: payload.requestId,
        error: payload.error,
      })
    }
    window.addEventListener('message', messageHandler)
  })
  const popupClosedPromise = new Promise((resolve) => {
    closeInterval = setInterval(() => {
      if (authPopup.closed) {
        clearInterval(closeInterval)
        closeInterval = null
        resolve({ __closed: true })
      }
    }, 500)
  })

  const pollPromise = pollIntentAuthorizationStatus(authorizationSessionId, {
    backendUrl: statusBackendUrl,
    authToken: authToken || prepareData?.backendAuthToken,
  }).catch((error) => ({ __pollError: error }))

  let status
  try {
    const firstResult = await Promise.race([pollPromise, popupClosedPromise, messagePromise])
    if (firstResult && firstResult.__closed) {
      const graceMs = 800
      try {
        const requestId = requestIdResolver(prepareData)
        const graceResultPromise = Promise.race([
          pollPromise,
          messagePromise,
          new Promise((resolve) => setTimeout(() => resolve({ __closed: true }), graceMs)),
        ])
        const presenceChecker = presenceFn || pollIntentPresence
        const intentPresencePromise = presenceChecker(requestId, {
          backendUrl: prepareData?.backendUrl || backendUrl,
          authToken: authToken || prepareData?.backendAuthToken,
          stopOnUnexpected4xx,
        })
        const graceResult = await graceResultPromise

        if (graceResult && graceResult.__pollError) {
          status = {
            status: 'UNKNOWN',
            requestId,
            error: graceResult.__pollError?.message || 'Authorization status unavailable',
          }
        } else if (graceResult && graceResult.__message) {
          status = graceResult
        } else if (graceResult && graceResult.__closed) {
          const intentPresence = await intentPresencePromise
          if (intentPresence === 'present') {
            status = { status: 'SUCCESS', requestId }
          } else if (intentPresence === 'absent') {
            status = {
              status: 'CANCELLED',
              requestId,
              error: 'Authorization window closed',
            }
          } else {
            status = {
              status: 'UNKNOWN',
              requestId,
              error: 'Authorization window closed',
            }
          }
        } else {
          status = graceResult
        }
      } catch (err) {
        status = {
          status: 'UNKNOWN',
          requestId: requestIdResolver(prepareData),
          error: err?.message || 'Authorization window closed',
        }
      }
    } else if (firstResult?.__pollError) {
      status = {
        status: 'UNKNOWN',
        requestId: requestIdResolver(prepareData),
        error: firstResult.__pollError?.message || 'Authorization status unavailable',
      }
    } else {
      status = firstResult
    }
  } finally {
    if (closeInterval) {
      clearInterval(closeInterval)
    }
    if (messageHandler) {
      window.removeEventListener('message', messageHandler)
    }
    if (closePopupInFinally) {
      closePopupSafely(authPopup)
    }
  }

  const normalized = (status?.status || '').toUpperCase()
  if (normalized === 'FAILED') {
    throw new Error(status?.error || 'Intent authorization failed')
  }

  if (!closePopupInFinally) {
    closePopupSafely(authPopup)
  }

  return status
}
