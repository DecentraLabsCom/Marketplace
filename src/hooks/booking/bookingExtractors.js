/**
 * Cache extraction helpers for booking data
 * Pure utility functions that work with the result objects from composed booking hooks
 */

/**
 * Cache extraction helper for finding a specific booking from user bookings
 * @param {Object} userBookingsResult - Result from useUserBookingsDashboard
 * @param {string} reservationKey - Reservation key to find
 * @returns {Object|null} Booking data if found, null otherwise
 */
export const extractBookingFromUser = (userBookingsResult, reservationKey) => {
  if (!userBookingsResult?.data?.bookings || !reservationKey) return null;
  
  return userBookingsResult.data.bookings.find(booking => 
    booking.reservationKey === reservationKey
  ) || null;
};

/**
 * Cache extraction helper for filtering bookings by status category
 * @param {Object} bookingsResult - Result from composed booking hooks
 * @param {string} statusCategory - Status to filter by (active, completed, cancelled, upcoming)
 * @returns {Array} Array of bookings with the specified status
 */
export const extractBookingsByStatus = (bookingsResult, statusCategory) => {
  if (!bookingsResult?.data?.bookings || !statusCategory) return [];
  
  return bookingsResult.data.bookings.filter(booking => 
    booking.statusCategory === statusCategory
  );
};

/**
 * Cache extraction helper for getting active bookings
 * @param {Object} bookingsResult - Result from composed booking hooks
 * @returns {Array} Array of active bookings
 */
export const extractActiveBookings = (bookingsResult) => {
  return extractBookingsByStatus(bookingsResult, 'active');
};

/**
 * Cache extraction helper for getting upcoming bookings
 * @param {Object} bookingsResult - Result from composed booking hooks
 * @returns {Array} Array of upcoming bookings
 */
export const extractUpcomingBookings = (bookingsResult) => {
  return extractBookingsByStatus(bookingsResult, 'upcoming');
};

/**
 * Cache extraction helper for getting completed bookings
 * @param {Object} bookingsResult - Result from composed booking hooks
 * @returns {Array} Array of completed bookings
 */
export const extractCompletedBookings = (bookingsResult) => {
  return extractBookingsByStatus(bookingsResult, 'completed');
};

/**
 * Cache extraction helper for getting cancelled bookings
 * @param {Object} bookingsResult - Result from composed booking hooks
 * @returns {Array} Array of cancelled bookings
 */
export const extractCancelledBookings = (bookingsResult) => {
  return extractBookingsByStatus(bookingsResult, 'cancelled');
};
