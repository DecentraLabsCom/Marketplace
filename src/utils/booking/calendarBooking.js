/**
 * Shared booking normalization for calendar consumers.
 * Ensures date/status fields are consistent across reservation, user, and provider pages.
 */
import { normalizeBookingStatusCode } from '@/utils/booking/bookingStatus'

const parseUnixSeconds = (value) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

const normalizeStatus = (booking) => {
  const normalized = normalizeBookingStatusCode(booking)
  return normalized === null ? booking?.status : normalized
}

const resolveLabName = (booking, labName) => {
  if (typeof labName === 'function') return labName(booking)
  if (typeof labName === 'string' && labName.trim()) return labName
  return booking?.labName || booking?.labDetails?.name
}

export const normalizeBookingForCalendar = (booking, options = {}) => {
  if (!booking || typeof booking !== 'object') return null

  const start = parseUnixSeconds(booking.start)
  const end = parseUnixSeconds(booking.end)
  const derivedDate = start ? new Date(start * 1000).toLocaleDateString('en-CA') : null

  return {
    ...booking,
    id: booking.id || booking.reservationKey,
    reservationKey: booking.reservationKey || booking.id,
    labName: resolveLabName(booking, options.labName),
    status: normalizeStatus(booking),
    date: booking.date || booking.dateString || derivedDate,
    start,
    end
  }
}

export const mapBookingsForCalendar = (bookings = [], options = {}) => {
  if (!Array.isArray(bookings) || bookings.length === 0) return []
  return bookings
    .map((booking) => normalizeBookingForCalendar(booking, options))
    .filter(Boolean)
}
