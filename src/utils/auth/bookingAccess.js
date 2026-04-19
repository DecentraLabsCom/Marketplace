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
 * @param {string|null|undefined} params.address
 * @returns {boolean}
 */
export function canFetchUserBookings({
  isLoggedIn = false,
  isSSO = false,
  address = null,
} = {}) {
  if (!isLoggedIn) return false;
  if (!isSSO) return false;
  return true;
}

/**
 * Resolves the address argument used by booking hooks.
 * Institutional bookings are scoped by server-side session, so address must be null.
 *
 * @param {Object} params
 * @param {boolean} params.isSSO
 * @param {string|null|undefined} params.address
 * @returns {string|null}
 */
export function resolveBookingsUserAddress({ isSSO = false, address = null } = {}) {
  return null;
}

export default {
  canFetchUserBookings,
  resolveBookingsUserAddress,
}
