import { BOOKING_STATE, normalizeBookingStatusState } from '@/utils/booking/bookingStatus'
import { normalizeReservationKey } from '@/utils/booking/reservationKey'

const toEpochSeconds = (value) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

export const isFinalBookingState = (state) =>
  state === BOOKING_STATE.CONFIRMED ||
  state === BOOKING_STATE.IN_USE ||
  state === BOOKING_STATE.COMPLETED ||
  state === BOOKING_STATE.COLLECTED ||
  state === BOOKING_STATE.CANCELLED

/**
 * Find the booking that best matches a just-submitted reservation request.
 * Preference order:
 * 1) non-optimistic + final status
 * 2) non-optimistic
 * 3) any matching candidate
 */
export const findTrackedBookingForFlow = (bookings, activeRequest) => {
  if (!activeRequest || !Array.isArray(bookings) || bookings.length === 0) return null

  const normalizedRequestKey = normalizeReservationKey(activeRequest.reservationKey)
  const requestedLabId = String(activeRequest.labId)
  const requestedStart = toEpochSeconds(activeRequest.start)

  const candidates = bookings.filter((booking) => {
    if (String(booking?.labId) !== requestedLabId) return false

    const bookingKey = normalizeReservationKey(booking?.reservationKey || booking?.id)
    if (normalizedRequestKey && bookingKey && bookingKey === normalizedRequestKey) return true

    const bookingStart = toEpochSeconds(booking?.start)
    if (!Number.isFinite(requestedStart) || !Number.isFinite(bookingStart)) return false

    return Math.abs(bookingStart - requestedStart) <= 60
  })

  if (candidates.length === 0) return null

  const nonOptimistic = candidates.filter((booking) => booking?.isOptimistic !== true)
  const finalNonOptimistic = nonOptimistic.find((booking) =>
    isFinalBookingState(normalizeBookingStatusState(booking))
  )
  if (finalNonOptimistic) return finalNonOptimistic

  if (nonOptimistic.length > 0) return nonOptimistic[0]

  return candidates[0]
}

