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
  return booking.status === 4 || booking.status === "4" || booking.status === BOOKING_STATUS.CANCELLED;
}

/**
 * Check if a booking is used/completed
 * @param {Object} booking - Booking object
 * @returns {boolean} True if booking is used
 */
export const isUsedBooking = (booking) => {
  return booking.status === 2 || booking.status === "2";
}

/**
 * Check if a booking is collected
 * @param {Object} booking - Booking object
 * @returns {boolean} True if booking is collected
 */
export const isCollectedBooking = (booking) => {
  return booking.status === 3 || booking.status === "3";
}

/**
 * Get human-readable status text for UI display
 * @param {Object} booking - Booking object
 * @returns {string} Human-readable status
 */
export const getBookingStatusText = (booking) => {
  switch (Number(booking.status)) {
    case 0: return 'Pending';
    case 1: return 'Confirmed';
    case 2: return 'Used';
    case 3: return 'Collected';
    case 4: return 'Cancelled';
    default: return 'Unknown';
  }
}

/**
 * Get status color class for UI styling
 * @param {Object} booking - Booking object
 * @returns {string} CSS class name for status color
 */
export const getBookingStatusColor = (booking) => {
  switch (Number(booking.status)) {
    case 0: return 'text-yellow-600';      // Pending - yellow
    case 1: return 'text-green-600';       // Confirmed - green
    case 2: return 'text-blue-600';        // Used - blue
    case 3: return 'text-gray-600';        // Collected - gray
    case 4: return 'text-red-600';         // Cancelled - red
    default: return 'text-gray-400';       // Unknown - light gray
  }
}

/**
 * Get status display information for UI components
 * @param {Object} booking - Booking object
 * @returns {Object} Display object with text, className, and icon
 */
export const getBookingStatusDisplay = (booking) => {
  switch (Number(booking.status)) {
    case 0: return {
      text: "Pending",
      className: "bg-orange-100 text-orange-800 border-orange-200",
      icon: "⏳"
    };
    case 1: return {
      text: "Confirmed",
      className: "bg-blue-100 text-blue-800 border-blue-200",
      icon: "✓"
    };
    case 2: return {
      text: "Used",
      className: "bg-green-100 text-green-800 border-green-200",
      icon: "✅"
    };
    case 3: return {
      text: "Collected",
      className: "bg-purple-100 text-purple-800 border-purple-200",
      icon: "🎯"
    };
    case 4: return {
      text: "Cancelled",
      className: "bg-red-100 text-red-800 border-red-200",
      icon: "❌"
    };
    default: return {
      text: "Unknown",
      className: "bg-gray-100 text-gray-800 border-gray-200",
      icon: "❓"
    };
  }
}

/**
 * Check if a booking is pending
 * @param {Object} booking - Booking object
 * @returns {boolean} True if booking is pending
 */
export const isPendingBooking = (booking) => {
  return booking.status === 0 || booking.status === "0" || booking.status === BOOKING_STATUS.PENDING;
}

/**
 * Check if a booking is confirmed
 * @param {Object} booking - Booking object
 * @returns {boolean} True if booking is confirmed
 */
export const isConfirmedBooking = (booking) => {
  return booking.status === 1 || booking.status === "1" || booking.status === BOOKING_STATUS.CONFIRMED;
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
  // Check for date field first
  if (booking.date) {
    const bookingDate = new Date(booking.date)
    if (!isNaN(bookingDate.getTime())) {
      return true
    }
  }
  
  // Fallback: try to extract date from startDate or start timestamp
  if (booking.startDate) {
    const startDate = new Date(booking.startDate)
    if (!isNaN(startDate.getTime())) {
      // Add the missing date field for future use
      booking.date = startDate.toLocaleDateString('en-CA') // YYYY-MM-DD format
      return true
    }
  }
  
  // Fallback: try to extract from start timestamp
  if (booking.start) {
    try {
      const startNum = parseInt(booking.start)
      if (!isNaN(startNum) && startNum > 0) {
        const startDate = new Date(startNum * 1000)
        if (!isNaN(startDate.getTime())) {
          // Add the missing date field for future use
          booking.date = startDate.toLocaleDateString('en-CA') // YYYY-MM-DD format
          return true
        }
      }
    } catch (error) {
      // Continue to warning below
    }
  }
  
  devLog.warn('❌ Booking missing date field:', booking)
  return false
}

/**
 * Filter bookings based on display mode and business logic
 * @param {Array} bookings - Array of booking objects
 * @param {string} displayMode - Display mode ('lab-reservation', 'user-dashboard', 'provider-dashboard', 'default')
 * @returns {Array} Filtered array of bookings
 */
export const filterBookingsByDisplayMode = (bookings = [], displayMode = 'default') => {
  return bookings.filter(booking => {
    // Always exclude cancelled bookings
    if (isCancelledBooking(booking)) {
      return false
    }
    
    // Check if we have the necessary fields for date calculation
    if (!hasValidDate(booking)) {
      return false
    }
    
    const isPast = isPastBooking(booking)
    const isPending = isPendingBooking(booking)
    const isConfirmed = isConfirmedBooking(booking)
    
    switch (displayMode) {
      case 'lab-reservation':
        // LabReservation: show both pending and confirmed future reservations
        return !isPast && (isPending || isConfirmed)
        
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
  });
}
