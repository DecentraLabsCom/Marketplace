/**
 * Time and duration calculation utilities for booking system
 */

/**
 * Calculate booking duration between two dates
 * @param {Date|string} startDate - Start date/time
 * @param {Date|string} endDate - End date/time
 * @returns {Object} Duration object with hours, minutes, and total milliseconds
 */
export function calculateBookingDuration(startDate, endDate) {
  const start = new Date(startDate)
  const end = new Date(endDate)
  
  const totalMs = end.getTime() - start.getTime()
  const totalMinutes = Math.floor(totalMs / (1000 * 60))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  
  return {
    hours,
    minutes,
    totalMinutes,
    totalMs
  }
}

/**
 * Format duration as human-readable string
 * @param {number} hours - Number of hours
 * @param {number} minutes - Number of minutes
 * @returns {string} Formatted duration string
 */
export function formatDuration(hours, minutes = 0) {
  if (hours === 0 && minutes === 0) {
    return '0 minutes'
  }
  
  const parts = []
  
  if (hours > 0) {
    parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`)
  }
  
  if (minutes > 0) {
    parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`)
  }
  
  return parts.join(' ')
}

/**
 * Add hours to a date
 * @param {Date} date - Base date
 * @param {number} hours - Hours to add
 * @returns {Date} New date with hours added
 */
export function addHours(date, hours) {
  const result = new Date(date)
  result.setHours(result.getHours() + hours)
  return result
}

/**
 * Add minutes to a date
 * @param {Date} date - Base date
 * @param {number} minutes - Minutes to add
 * @returns {Date} New date with minutes added
 */
export function addMinutes(date, minutes) {
  const result = new Date(date)
  result.setMinutes(result.getMinutes() + minutes)
  return result
}

/**
 * Check if a time is within business hours
 * @param {Date} date - Date to check
 * @param {string} opens - Opening time (HH:MM format)
 * @param {string} closes - Closing time (HH:MM format)
 * @returns {boolean} True if within business hours
 */
export function isWithinBusinessHours(date, opens, closes) {
  const [openHour, openMinute] = opens.split(':').map(Number)
  const [closeHour, closeMinute] = closes.split(':').map(Number)
  
  const openTime = openHour * 60 + openMinute
  const closeTime = closeHour * 60 + closeMinute
  const currentTime = date.getHours() * 60 + date.getMinutes()
  
  return currentTime >= openTime && currentTime <= closeTime
}

/**
 * Round time to nearest interval
 * @param {Date} date - Date to round
 * @param {number} intervalMinutes - Interval in minutes (default: 30)
 * @returns {Date} Rounded date
 */
export function roundToInterval(date, intervalMinutes = 30) {
  const result = new Date(date)
  const minutes = result.getMinutes()
  const roundedMinutes = Math.round(minutes / intervalMinutes) * intervalMinutes
  
  result.setMinutes(roundedMinutes)
  result.setSeconds(0)
  result.setMilliseconds(0)
  
  return result
}

/**
 * Get time slots for a day
 * @param {Date} date - Date for time slots
 * @param {string} opens - Opening time (HH:MM format)
 * @param {string} closes - Closing time (HH:MM format)
 * @param {number} slotDuration - Slot duration in minutes (default: 60)
 * @returns {Array} Array of time slot objects
 */
export function getTimeSlots(date, opens, closes, slotDuration = 60) {
  const [openHour, openMinute] = opens.split(':').map(Number)
  const [closeHour, closeMinute] = closes.split(':').map(Number)
  
  const slots = []
  const start = new Date(date)
  start.setHours(openHour, openMinute, 0, 0)
  
  const end = new Date(date)
  end.setHours(closeHour, closeMinute, 0, 0)
  
  let current = new Date(start)
  
  while (current < end) {
    const slotEnd = addMinutes(current, slotDuration)
    
    if (slotEnd <= end) {
      slots.push({
        start: new Date(current),
        end: new Date(slotEnd),
        duration: slotDuration
      })
    }
    
    current = slotEnd
  }
  
  return slots
}

/**
 * Check if two time periods overlap
 * @param {Date} start1 - Start of first period
 * @param {Date} end1 - End of first period
 * @param {Date} start2 - Start of second period
 * @param {Date} end2 - End of second period
 * @returns {boolean} True if periods overlap
 */
export function timePeriodsOverlap(start1, end1, start2, end2) {
  return start1 < end2 && start2 < end1
}
