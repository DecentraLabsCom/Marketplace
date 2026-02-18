/**
 * Shared access rules for booking-related user queries.
 * Keep this logic centralized so home/dashboard stay behaviorally aligned.
 */

/**
 * Determines if user booking queries should run for the current session.
 * SSO users do not require wallet state; wallet users require a stable wallet session.
 *
 * @param {Object} params
 * @param {boolean} params.isLoggedIn
 * @param {boolean} params.isSSO
 * @param {string|null|undefined} params.address
 * @param {boolean} params.hasWalletSession
 * @param {boolean} [params.isWalletLoading=false]
 * @returns {boolean}
 */
export function canFetchUserBookings({
  isLoggedIn = false,
  isSSO = false,
  address = null,
  hasWalletSession = false,
  isWalletLoading = false,
} = {}) {
  if (!isLoggedIn) return false;
  if (isSSO) return true;
  return Boolean(address && hasWalletSession && !isWalletLoading);
}

/**
 * Resolves the address argument used by booking hooks.
 * SSO bookings are scoped by server-side session, so address must be null.
 *
 * @param {Object} params
 * @param {boolean} params.isSSO
 * @param {string|null|undefined} params.address
 * @returns {string|null}
 */
export function resolveBookingsUserAddress({ isSSO = false, address = null } = {}) {
  return isSSO ? null : (address || null);
}

export default {
  canFetchUserBookings,
  resolveBookingsUserAddress,
}
