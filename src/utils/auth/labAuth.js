/**
 * Lab authentication utilities
 * Handles institutional authentication flow for lab access.
 */
import devLog from '@/utils/dev/logger'

const MAX_PENDING_AUTHORIZATION_RETRIES = 8
const DEFAULT_PENDING_AUTHORIZATION_RETRY_MS = 1_000
const MAX_PENDING_AUTHORIZATION_RETRY_MS = 5_000

function parseRetryAfterMilliseconds(response) {
  const raw = response?.headers?.get?.('retry-after')
  if (!raw) return DEFAULT_PENDING_AUTHORIZATION_RETRY_MS

  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(MAX_PENDING_AUTHORIZATION_RETRY_MS, Math.ceil(seconds * 1_000))
  }

  const retryAt = Date.parse(raw)
  if (!Number.isFinite(retryAt)) return DEFAULT_PENDING_AUTHORIZATION_RETRY_MS
  return Math.min(MAX_PENDING_AUTHORIZATION_RETRY_MS, Math.max(0, retryAt - Date.now()))
}

async function requestLabAccess({
  labId,
  reservationKey,
  retryPendingAuthorization = false,
  accessAuthorizationTxHash = null,
}) {
  const requestBody = { labId, reservationKey }
  if (retryPendingAuthorization) {
    requestBody.retryPendingAuthorization = true
    if (accessAuthorizationTxHash) {
      requestBody.accessAuthorizationTxHash = accessAuthorizationTxHash
    }
  }

  const response = await fetch('/api/auth/lab-access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(requestBody),
  })

  if (response.ok) return response.json()

  let payload = {}
  if (typeof response.text === 'function') {
    const text = await response.text()
    try {
      payload = text ? JSON.parse(text) : {}
    } catch {
      payload = {}
    }
  }
  const error = new Error(payload.error || `SSO authentication failed. Status: ${response.status}`)
  if (payload.code) error.code = payload.code
  if (payload.correlationId) error.correlationId = payload.correlationId
  if (typeof payload.retryable === 'boolean') error.retryable = payload.retryable
  if (payload.reservationKey) error.reservationKey = payload.reservationKey
  if (payload.txHash) error.txHash = payload.txHash
  error.retryAfterMs = parseRetryAfterMilliseconds(response)
  throw error
}

/**
 * Authenticates SSO user for lab access using marketplace-backed flow.
 * @param {Object} params
 * @param {string|number} params.labId - Lab ID to access
 * @param {string} [params.reservationKey] - Optional reservation key for validation
 * @returns {Promise<Object>} Authentication result with one-time accessCode and labURL or error
 * @throws {Error} If any step of the SSO authentication process fails
 */
export const authenticateLabAccessSSO = async ({
  labId,
  reservationKey = null,
} = {}) => {
  try {
    if (!labId && !reservationKey) {
      throw new Error('Missing labId or reservationKey for SSO access');
    }

    let currentReservationKey = reservationKey
    let retryPendingAuthorization = false
    let accessAuthorizationTxHash = null

    for (let attempt = 0; attempt <= MAX_PENDING_AUTHORIZATION_RETRIES; attempt += 1) {
      try {
        return await requestLabAccess({
          labId,
          reservationKey: currentReservationKey,
          retryPendingAuthorization,
          accessAuthorizationTxHash,
        })
      } catch (error) {
        const canRetry = error?.code === 'ACCESS_AUTHORIZATION_PENDING'
          && error.retryable === true
          && attempt < MAX_PENDING_AUTHORIZATION_RETRIES
        if (!canRetry) throw error

        currentReservationKey = error.reservationKey || currentReservationKey
        accessAuthorizationTxHash = error.txHash || null
        await new Promise((resolve) => setTimeout(resolve, error.retryAfterMs))
        retryPendingAuthorization = true
      }
    }
  } catch (error) {
    devLog.error('ERROR: SSO lab authentication failed:', error);
    throw error;
  }
};

/**
 * Maps institutional authentication errors to user-friendly messages.
 * @param {Error} error - The error object from authentication process
 * @returns {string} User-friendly error message
 */
export const getAuthErrorMessage = (error) => {
  const code = error?.code
  const message = error?.message || ''
  if (code === 'CHECKIN_SIGNER_NOT_AUTHORIZED') {
    return 'The institution is not authorized to check in this reservation. Please contact your institution administrator.'
  } else if (code === 'CHECKIN_MANUAL_INTERVENTION') {
    return 'This reservation requires institutional intervention before access can be granted.'
  } else if (code === 'CHECKIN_CONTEXT_MISMATCH') {
    return 'The reservation authorization context changed. Please try again or contact support.'
  } else if (code === 'ACCESS_AUTHORIZATION_PENDING') {
    return 'Access authorization is still pending. Please try again in a moment.'
  } else if (code === 'ACCESS_AUTHORIZATION_REJECTED') {
    return 'The reservation was not authorized for laboratory access.'
  } else if (message.includes('Missing labId') || message.includes('Missing reservationKey')) {
    return 'Missing booking details for SSO access. Please try again.';
  } else if (message.includes('SSO authentication failed')) {
    return 'Failed to authenticate with lab service. Please try again.';
  } else if (message.includes('Missing SSO session')) {
    return 'Please sign in with your institution and try again.';
  } else if (message.includes('Lab does not have a configured Lab Gateway')) {
    return 'This lab does not support institutional access. Please contact the provider.';
  } else {
    return 'There was an error with institutional authentication. Please try again.';
  }
};
