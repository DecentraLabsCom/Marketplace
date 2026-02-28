import { markBrowserCredentialVerified } from '@/utils/onboarding/browserCredentialMarker'

export const resolveIntentRequestId = (data) =>
  data?.requestId ||
  data?.intent?.meta?.requestId ||
  data?.intent?.requestId ||
  data?.intent?.request_id ||
  data?.intent?.requestId?.toString?.()

export const createIntentMutationError = (payload, fallbackMessage) => {
  const message =
    payload?.error ||
    payload?.message ||
    fallbackMessage
  const err = new Error(message)
  if (payload?.code) {
    err.code = payload.code
  }
  // Attach concise user-facing message based on backend error codes
  const code = (payload?.code || '').toLowerCase()
  if (code === 'slot_unavailable' || code === 'timeslot_conflict') {
    err.userMessage = 'Time slot no longer available'
  } else if (code === 'lab_not_listed' || code === 'lab_not_found') {
    err.userMessage = 'Lab is not available'
  } else if (code === 'insufficient_balance') {
    err.userMessage = 'Insufficient token balance'
  } else if (code === 'provider_rejected') {
    err.userMessage = 'Request rejected by provider'
  }
  return err
}

export const createAuthorizationCancelledError = (message = 'Authorization cancelled by user') => {
  const err = new Error(message)
  err.code = 'INTENT_AUTH_CANCELLED'
  return err
}

export const createAuthorizationSessionUnavailableError = (message = 'Authorization session unavailable') => {
  const err = new Error(message)
  err.code = 'INTENT_AUTH_SESSION_UNAVAILABLE'
  return err
}

export const markBrowserCredentialVerifiedFromIntent = (
  prepareData,
  { includeReservationPayload = false } = {},
) => {
  try {
    const actionPayload =
      prepareData?.intent?.payload ||
      prepareData?.intent?.actionPayload ||
      (includeReservationPayload ? prepareData?.intent?.reservationPayload : null) ||
      null

    const stableUserId = actionPayload?.puc || actionPayload?.stableUserId || null
    if (!stableUserId) return

    markBrowserCredentialVerified({
      stableUserId,
      institutionId:
        actionPayload?.schacHomeOrganization ||
        actionPayload?.institutionId ||
        null,
    })
  } catch {
    // Marker updates are best-effort and must never break write flows.
  }
}

export const normalizeAuthorizationUrl = (authorizationUrl, backendUrl) => {
  if (!authorizationUrl) return null
  const raw = String(authorizationUrl).trim()
  if (!raw) return null
  if (/^https?:\/\//i.test(raw)) {
    if (!backendUrl) return raw
    try {
      const parsed = new URL(raw)
      const hostname = parsed.hostname.toLowerCase()
      const isLocal =
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '0.0.0.0'

      if (hostname === 'intents' || (!hostname.includes('.') && !isLocal)) {
        let path = parsed.pathname || ''
        if (!path.startsWith('/intents')) {
          path = `/intents${path.startsWith('/') ? '' : '/'}${path}`
        }
        return new URL(`${path}${parsed.search || ''}${parsed.hash || ''}`, backendUrl).toString()
      }

      return raw
    } catch {
      return raw
    }
  }
  const normalized = raw.startsWith('//') ? raw.replace(/^\/+/, '/') : raw
  if (backendUrl) {
    try {
      return new URL(normalized, backendUrl).toString()
    } catch {
      // fall through
    }
  }
  return normalized
}

export const resolveAuthorizationInfo = (prepareData, backendUrl) => ({
  authorizationUrl: normalizeAuthorizationUrl(
    prepareData?.authorizationUrl || prepareData?.ceremonyUrl || null,
    prepareData?.backendUrl || backendUrl
  ),
  authorizationSessionId: prepareData?.authorizationSessionId || prepareData?.sessionId || null,
})

export const openAuthorizationPopup = (authorizationUrl, popup, { keepOpener = false } = {}) => {
  if (!authorizationUrl) return null

  let authPopup = popup && !popup.closed ? popup : null
  if (!authPopup) {
    authPopup = window.open(
      authorizationUrl,
      'intent-authorization',
      'width=480,height=720'
    )
  }

  if (authPopup) {
    try {
      if (!keepOpener) {
        authPopup.opener = null
      }
      authPopup.focus()
    } catch {
      // ignore opener errors
    }
  }

  return authPopup
}

export const openAuthorizationPopupFallback = (authorizationUrl, { keepOpener = false } = {}) => {
  if (!authorizationUrl) return null
  const fallback = window.open(
    authorizationUrl,
    'intent-authorization',
    'width=480,height=720'
  )
  if (fallback) {
    try {
      if (!keepOpener) {
        fallback.opener = null
      }
    } catch {
      // ignore opener errors
    }
  }
  return fallback
}
