/**
 * Minimum time that must remain between submitting a reservation and its start.
 * Keep this aligned with LibReservationConfig.RESERVATION_CONFIRMATION_LEAD_TIME
 * and the institutional backend validation.
 */
export const MIN_RESERVATION_LEAD_TIME_SECONDS = 10 * 60

export function getMinimumReservationStartUnix(now = Date.now()) {
  const milliseconds = now instanceof Date ? now.getTime() : Number(now)
  if (!Number.isFinite(milliseconds)) return null

  return Math.floor(milliseconds / 1000) + MIN_RESERVATION_LEAD_TIME_SECONDS
}

export function hasReservationLeadTime(start, now = Date.now()) {
  const startUnix = typeof start === 'bigint' ? Number(start) : Number(start)
  const minimumStartUnix = getMinimumReservationStartUnix(now)

  return Number.isSafeInteger(startUnix)
    && minimumStartUnix !== null
    && startUnix >= minimumStartUnix
}
