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
 * @param {string} [params.authEndpoint] - Optional auth endpoint override
 * @param {boolean} [params.skipCheckIn] - Skip check-in when reservation is already marked in use
 * @returns {Promise<Object>} Authentication result with token and labURL or error
 * @throws {Error} If any step of the SSO authentication process fails
 */
export const authenticateLabAccessSSO = async ({
  labId,
  reservationKey = null,
  authEndpoint = null,
  skipCheckIn = false,
} = {}) => {
  try {
    if (!labId && !reservationKey) {
      throw new Error('Missing labId or reservationKey for SSO access');
    }

    if (!skipCheckIn) {
      await submitInstitutionalCheckIn({ reservationKey, labId, authEndpoint });
    }

    const response = await fetch('/api/auth/lab-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ labId, reservationKey, authEndpoint }),
    });

    if (!response.ok) {
      throw new Error(`SSO authentication failed. Status: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    devLog.error('ERROR: SSO lab authentication failed:', error);
    throw error;
  }
};

export const submitInstitutionalCheckIn = async ({
  reservationKey = null,
  labId = null,
  authEndpoint = null,
} = {}) => {
  const response = await fetch('/api/auth/checkin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ reservationKey, labId, authEndpoint }),
  });

  if (!response.ok) {
    throw new Error(`Institutional check-in failed. Status: ${response.status}`);
  }

  return response.json();
};

/**
 * Maps institutional authentication errors to user-friendly messages.
 * @param {Error} error - The error object from authentication process
 * @returns {string} User-friendly error message
 */
export const getAuthErrorMessage = (error) => {
  if (error.message.includes('Missing labId') || error.message.includes('Missing reservationKey')) {
    return 'Missing booking details for SSO access. Please try again.';
  } else if (error.message.includes('Institutional check-in failed')) {
    return 'Unable to record check-in. Please try again.';
  } else if (error.message.includes('SSO authentication failed')) {
    return 'Failed to authenticate with lab service. Please try again.';
  } else if (error.message.includes('Missing SSO session')) {
    return 'Please sign in with your institution and try again.';
  } else if (error.message.includes('Lab does not have a configured Lab Gateway')) {
    return 'This lab does not support institutional access. Please contact the provider.';
  } else {
    return 'There was an error with institutional authentication. Please try again.';
  }
};
