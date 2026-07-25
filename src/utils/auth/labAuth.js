/**
 * Lab authentication utilities
 * Handles institutional authentication flow for lab access.
 */
import devLog from '@/utils/dev/logger'

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

    const response = await fetch('/api/auth/lab-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ labId, reservationKey }),
    });

    if (!response.ok) {
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
      throw error
    }

    return response.json();
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
