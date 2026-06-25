import { markBrowserCredentialVerified } from '@/utils/onboarding/browserCredentialMarker'
import { verifyInstitutionReportedExecution } from '@/utils/intents/verifyOnchainIntentStatus'

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
    err.userMessage = 'Insufficient credit balance'
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

export const assertInstitutionIntentExecuted = async (
  requestId,
  statusResult,
  {
    signal,
    fallbackMessage = 'Intent not executed',
  } = {},
) => {
  const status = statusResult?.status
  if (status !== 'executed') {
    const reason = statusResult?.error || statusResult?.reason || fallbackMessage
    throw new Error(reason)
  }
  return verifyInstitutionReportedExecution(requestId, { signal })
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

const writePendingAuthorizationDocument = (popup) => {
  try {
    if (!popup || popup.closed || !popup.document) return
    popup.document.open()
    popup.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preparing authorization - DecentraLabs</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: #0f172a;
      color: #e2e8f0;
      font-family: Arial, Helvetica, sans-serif;
    }
    .panel {
      width: 100%;
      max-width: 420px;
      text-align: center;
      padding: 32px;
      border: 1px solid #1f2937;
      border-radius: 12px;
      background: #111827;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.5);
    }
    .spinner {
      width: 40px;
      height: 40px;
      margin: 0 auto 20px;
      border: 4px solid rgba(148, 163, 184, 0.35);
      border-top-color: #60a5fa;
      border-radius: 50%;
      animation: spin 0.9s linear infinite;
    }
    h1 { margin: 0 0 10px; font-size: 20px; }
    p { margin: 0; color: #94a3b8; font-size: 14px; line-height: 1.5; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <main class="panel" role="status" aria-live="polite">
    <div class="spinner" aria-hidden="true"></div>
    <h1>Preparing authorization</h1>
    <p>Keep this window open. The security prompt will appear here when the reservation request is ready.</p>
  </main>
</body>
</html>`)
    popup.document.close()
  } catch {
    // Best effort only; the popup can still be navigated later.
  }
}

export const openPendingAuthorizationPopup = () => {
  if (typeof window === 'undefined') return null
  const popup = window.open('', 'intent-authorization', 'width=480,height=720')
  if (popup) {
    writePendingAuthorizationDocument(popup)
    try {
      popup.focus()
    } catch {
      // ignore focus errors
    }
  }
  return popup
}

export const closeAuthorizationPopup = (popup) => {
  try {
    if (popup && !popup.closed) {
      popup.close()
    }
  } catch {
    // ignore close errors
  }
}

export const openAuthorizationPopup = (authorizationUrl, popup, { keepOpener = false } = {}) => {
  if (!authorizationUrl) return null

  let authPopup = popup && !popup.closed ? popup : null
  if (!authPopup) {
    authPopup = window.open(
      authorizationUrl,
      'intent-authorization',
      'width=480,height=720'
    )
  } else {
    try {
      authPopup.location.href = authorizationUrl
    } catch {
      try {
        authPopup.location.assign(authorizationUrl)
      } catch {
        return null
      }
    }
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
