/**
 * Composed React Query Hooks for Booking/Reservation-related operations
 * 
 * This barrel re-exports the individual modules for backward compatibility.
 * Each hook now lives in its own file for maintainability:
 * - useUserBookingsDashboard.js  - user bookings dashboard hook
 * - useLabBookingsDashboard.js   - lab bookings dashboard hook (provider view)
 * - bookingExtractors.js         - pure cache extraction utilities
 */
export { useUserBookingsDashboard } from './useUserBookingsDashboard'
export { useLabBookingsDashboard } from './useLabBookingsDashboard'
export {
  extractBookingFromUser,
  extractBookingsByStatus,
  extractActiveBookings,
  extractUpcomingBookings,
  extractCompletedBookings,
  extractCancelledBookings,
} from './bookingExtractors'