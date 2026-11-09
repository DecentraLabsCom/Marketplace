/**
 * Composed React Query Hooks for Booking/Reservation-related operations
 * 
 * This barrel provides the booking hook exports from one module.
 * Each hook now lives in its own file for maintainability:
 * - useUserBookingsDashboard.js  - user bookings dashboard hook
 * - useLabBookingsDashboard.js   - lab bookings dashboard hook (provider view)
 */
export { useUserBookingsDashboard } from './useUserBookingsDashboard'
export { useLabBookingsDashboard } from './useLabBookingsDashboard'
