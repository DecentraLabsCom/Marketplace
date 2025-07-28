/**
 * Booking status utilities for filtering and categorizing bookings
 * Centralized logic for determining booking states and visibility
 */
import devLog from '@/utils/dev/logger'

/**
 * Booking status constants
 */
export const BOOKING_STATUS = {
  PENDING: 0,
  CONFIRMED: 1,
  COMPLETED: 2,
  CANCELLED: 4
}

/**
 * Check if a booking is cancelled
 * @param {Object} booking - Booking object
 * @returns {boolean} True if booking is cancelled
 */
export const isCancelledBooking = (booking) => {
  return booking.status === "4" || booking.status === 4 || booking.status === BOOKING_STATUS.CANCELLED
}

/**
 * Check if a booking is pending
 * @param {Object} booking - Booking object
 * @returns {boolean} True if booking is pending
 */
export const isPendingBooking = (booking) => {
  return booking.status === "0" || booking.status === 0 || booking.status === BOOKING_STATUS.PENDING
}

/**
 * Check if a booking is confirmed
 * @param {Object} booking - Booking object
 * @returns {boolean} True if booking is confirmed
 */
export const isConfirmedBooking = (booking) => {
  return booking.status === "1" || booking.status === 1 || booking.status === BOOKING_STATUS.CONFIRMED
}

/**
 * Check if a booking is in the past
 * @param {Object} booking - Booking object
 * @returns {boolean} True if booking has ended
 */
export const isPastBooking = (booking) => {
  try {
    if (!booking.start || !booking.end) {
      // If no timestamp info, compare by date only
      const bookingDate = new Date(booking.date)
      if (isNaN(bookingDate.getTime())) return false
      
      const today = new Date()
      const bookingDateStart = new Date(bookingDate.getFullYear(), bookingDate.getMonth(), bookingDate.getDate())
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
      return bookingDateStart < todayStart
    } else {
      // Use Unix timestamps to determine if booking has ended
      const endTimestamp = parseInt(booking.end) * 1000 // Convert to milliseconds
      const endDateTime = new Date(endTimestamp)
      return endDateTime < new Date()
    }
  } catch (error) {
    devLog.warn('Error calculating booking time:', booking, error)
    return false // Assume not past if we can't calculate
  }
}

/**
 * Validate if booking has required date information
 * @param {Object} booking - Booking object
 * @returns {boolean} True if booking has valid date
 */
export const hasValidDate = (booking) => {
  if (!booking.date) {
    devLog.warn('❌ Booking missing date field:', booking)
    return false
  }
  
  const bookingDate = new Date(booking.date)
  if (isNaN(bookingDate.getTime())) {
    devLog.warn('❌ Invalid booking date:', booking)
    return false
  }
  
  return true
}

/**
 * Filter bookings based on display mode and business logic
 * @param {Array} bookings - Array of booking objects
 * @param {string} displayMode - Display mode ('lab-reservation', 'user-dashboard', 'provider-dashboard', 'default')
 * @returns {Array} Filtered array of bookings
 */
export const filterBookingsByDisplayMode = (bookings = [], displayMode = 'default') => {
  return bookings.filter(booking => {
    devLog.log('🔍 Processing booking:', { 
      id: booking.id, 
      status: booking.status, 
      start: booking.start, 
      date: booking.date,
      labId: booking.labId 
    })
    
    // Always exclude cancelled bookings
    if (isCancelledBooking(booking)) {
      devLog.log('❌ Excluding cancelled booking:', booking.id)
      return false
    }
    
    // Check if we have the necessary fields for date calculation
    if (!hasValidDate(booking)) {
      return false
    }
    
    const isPast = isPastBooking(booking)
    const isPending = isPendingBooking(booking)
    const isConfirmed = isConfirmedBooking(booking)
    
    let shouldShow = false
    
    switch (displayMode) {
      case 'lab-reservation':
        // LabReservation: show both pending and confirmed future reservations
        shouldShow = !isPast && (isPending || isConfirmed)
        devLog.log('🏷️ lab-reservation result:', { 
          bookingId: booking.id, 
          shouldShow, 
          isPast, 
          isPending, 
          isConfirmed,
          date: booking.date,
          status: booking.status
        })
        return shouldShow
        
      case 'user-dashboard':
        // UserDashboard: user reservations (past and future with specific conditions)
        if (isPast) {
          // Past: only non-canceled and confirmed
          return isConfirmed
        } else {
          // Future: only confirmed and pending
          return isConfirmed || isPending
        }
        
      case 'provider-dashboard':
        // ProviderDashboard: user reservations (past and future with specific conditions)
        if (isPast) {
          // Past: only non-canceled and confirmed
          return isConfirmed
        } else {
          // Future: only confirmed and pending
          return isConfirmed || isPending
        }
        
      default:
        // Default behavior: exclude only past pending bookings
        if (isPending && isPast) {
          return false
        }
        return true
    }
  })
}
