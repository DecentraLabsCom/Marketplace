/**
 * Shared notification helper for all toast modules.
 *
 * Every domain-specific toast file (labToasts, reservationToasts, etc.) delegates
 * to this single implementation so the guard check and default dedupe window live
 * in one place.
 *
 * @param {Function} addTemporaryNotification - from NotificationContext
 * @param {string}   type       - 'success' | 'error' | 'warning' | 'pending'
 * @param {string}   message    - user-visible toast text
 * @param {string}   dedupeKey  - stable key to deduplicate rapid-fire calls
 * @param {Object}   [extraOptions]
 */
export const notify = (addTemporaryNotification, type, message, dedupeKey, extraOptions = {}) => {
  if (typeof addTemporaryNotification !== 'function') return
  addTemporaryNotification(type, message, null, {
    dedupeKey,
    dedupeWindowMs: 20000,
    ...extraOptions,
  })
}
