/**
 * Booking validation utilities
 */
import { timePeriodsOverlap } from './timeHelpers'

/**
 * Check if a time slot is available (not conflicting with existing bookings)
 * @param {Object} slot - Time slot to check
 * @param {Array} existingBookings - Array of existing bookings
 * @returns {boolean} True if slot is available
 */
export function isSlotAvailable(slot, existingBookings = []) {
  const { startDate, endDate } = slot
  
  // Check for conflicts with existing bookings
  for (const booking of existingBookings) {
    if (timePeriodsOverlap(
      new Date(startDate),
      new Date(endDate),
      new Date(booking.startDate),
      new Date(booking.endDate)
    )) {
      return false
    }
  }
  
  return true
}

/**
 * Validate booking data
 * @param {Object} booking - Booking data to validate
 * @returns {Object} Validation result with isValid flag and errors array
 */
export function validateBooking(booking) {
  const errors = []
  
  // Required fields
  if (!booking.labId) {
    errors.push('Lab ID is required')
  }
  
  if (!booking.startDate) {
    errors.push('Start date is required')
  }
  
  if (!booking.endDate) {
    errors.push('End date is required')
  }
  
  if (!booking.userAccount) {
    errors.push('User account is required')
  }
  
  // Date validation
  if (booking.startDate && booking.endDate) {
    const start = new Date(booking.startDate)
    const end = new Date(booking.endDate)
    
    if (end <= start) {
      errors.push('End date must be after start date')
    }
    
    if (start < new Date()) {
      errors.push('Start date cannot be in the past')
    }
  }
  
  // Purpose validation
  if (!booking.purpose || booking.purpose.trim().length === 0) {
    errors.push('Purpose is required')
  }
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

/**
 * Check if booking can be cancelled
 * @param {Object} booking - Booking to check
 * @param {number} minHoursBeforeStart - Minimum hours before start (default: 24)
 * @returns {boolean} True if booking can be cancelled
 */
export function canCancelBooking(booking, minHoursBeforeStart = 24) {
  const now = new Date()
  const startDate = new Date(booking.startDate)
  const hoursUntilStart = (startDate - now) / (1000 * 60 * 60)
  
  return hoursUntilStart >= minHoursBeforeStart
}

/**
 * Check if booking can be modified
 * @param {Object} booking - Booking to check
 * @param {number} minHoursBeforeStart - Minimum hours before start (default: 48)
 * @returns {boolean} True if booking can be modified
 */
export function canModifyBooking(booking, minHoursBeforeStart = 48) {
  const now = new Date()
  const startDate = new Date(booking.startDate)
  const hoursUntilStart = (startDate - now) / (1000 * 60 * 60)
  
  return hoursUntilStart >= minHoursBeforeStart
}

/**
 * Get booking status based on current time
 * @param {Object} booking - Booking object
 * @returns {string} Booking status: 'upcoming', 'active', 'completed', 'cancelled'
 */
export function getBookingStatus(booking) {
  if (booking.cancelled) {
    return 'cancelled'
  }
  
  const now = new Date()
  const start = new Date(booking.startDate)
  const end = new Date(booking.endDate)
  
  if (now < start) {
    return 'upcoming'
  } else if (now >= start && now <= end) {
    return 'active'
  } else {
    return 'completed'
  }
}

/**
 * Check if user can access lab now
 * @param {Object} booking - Booking object
 * @param {number} earlyAccessMinutes - Minutes before start time access is allowed (default: 5)
 * @returns {boolean} True if user can access lab
 */
export function canAccessLab(booking, earlyAccessMinutes = 5) {
  if (booking.cancelled) {
    return false
  }
  
  const now = new Date()
  const start = new Date(booking.startDate)
  const end = new Date(booking.endDate)
  const earlyAccess = new Date(start.getTime() - (earlyAccessMinutes * 60 * 1000))
  
  return now >= earlyAccess && now <= end
}
