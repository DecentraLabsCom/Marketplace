/**
 * Shared access rules for booking-related user queries.
 * Keep this logic centralized so home/dashboard stay behaviorally aligned.
 */

/**
 * Determines if user booking queries should run for the current session.
 * Booking queries are scoped to institutional SSO sessions.
 *
 * @param {Object} params
 * @param {boolean} params.isLoggedIn
 * @param {boolean} params.isSSO
 * @returns {boolean}
 */
export function canFetchUserBookings({
  isLoggedIn = false,
  isSSO = false,
} = {}) {
  if (!isLoggedIn) return false;
  if (!isSSO) return false;
  return true;
}
