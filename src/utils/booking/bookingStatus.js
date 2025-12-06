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
  IN_USE: 2,
  COMPLETED: 3,
  COLLECTED: 4,
  CANCELLED: 5
}

/**
 * Check if a booking is cancelled
 * @param {Object} booking - Booking object
 * @returns {boolean} True if booking is cancelled
 */
export const isCancelledBooking = (booking) => {
  return booking.status === 5 || booking.status === "5" || booking.status === BOOKING_STATUS.CANCELLED;
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
  return booking.status === 4 || booking.status === "4";
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
    case 2: return 'In Use';
    case 3: return 'Completed';
    case 4: return 'Collected';
    case 5: return 'Cancelled';
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
    case 0: return 'text-warning';         // Pending - warning yellow
    case 1: return 'text-success';         // Confirmed - success green
    case 2: return 'text-info';            // In use - info blue
    case 3: return 'text-neutral-600';     // Completed - neutral gray
    case 4: return 'text-neutral-500';     // Collected - neutral gray
    case 5: return 'text-error';           // Cancelled - error red
    default: return 'text-neutral-400';    // Unknown - light gray
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
      className: "bg-booking-pending-bg text-booking-pending-text border-booking-pending-border",
      icon: "⏳"
    };
    case 1: return {
      text: "Confirmed",
      className: "bg-booking-confirmed-bg text-booking-confirmed-text border-booking-confirmed-border",
      icon: "✓"
    };
    case 2: return {
      text: "In Use",
      className: "bg-booking-used-bg text-booking-used-text border-booking-used-border",
      icon: "✅"
    };
    case 3: return {
      text: "Completed",
      className: "bg-booking-collected-bg text-booking-collected-text border-booking-collected-border",
      icon: "🎯"
    };
    case 4: return {
      text: "Collected",
      className: "bg-booking-collected-bg text-booking-collected-text border-booking-collected-border",
      icon: "🎯"
    };
    case 5: return {
      text: "Cancelled",
      className: "bg-booking-cancelled-bg text-booking-cancelled-text border-booking-cancelled-border",
      icon: "❌"
    };
    default: return {
      text: "Unknown",
      className: "bg-neutral-100 text-neutral-800 border-neutral-200",
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
