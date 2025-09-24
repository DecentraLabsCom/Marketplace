/**
 * Hook for filtering and processing bookings for calendar display
 * Centralizes booking filter logic and day highlighting
 */
import { useMemo } from 'react'
import { filterBookingsByDisplayMode, isPendingBooking, isConfirmedBooking } from '@/utils/booking/bookingStatus'
import { parseDateSafe, isSameCalendarDay } from '@/utils/dates/parseDateSafe'
import devLog from '@/utils/dev/logger'

/**
 * Custom hook for filtering bookings and determining day highlighting
 * @param {Array} bookingInfo - Array of booking objects
 * @param {string} displayMode - Display mode for filtering
 * @param {string} highlightClassName - CSS class for highlighted days
 * @returns {Object} Filtered bookings and day className function
 * @returns {Array} returns.filteredBookings - Bookings filtered by display mode
 * @returns {Function} returns.dayClassName - Function to determine day CSS class based on bookings
 */
export function useBookingFilter(bookingInfo = [], displayMode = 'default', highlightClassName = "bg-[#9fc6f5] text-white") {
  
  // Ensure bookingInfo is always an array
  const safeBookingInfo = Array.isArray(bookingInfo) ? bookingInfo : []
  
  // Filter bookings based on display mode and business logic
  const filteredBookings = useMemo(() => {
    const filtered = filterBookingsByDisplayMode(safeBookingInfo, displayMode)
    
    // Only log if there are actual changes or issues
    if (filtered.length !== safeBookingInfo?.length) {
      devLog.log('🔍 CalendarWithBookings: Filtering results:', {
        originalCount: safeBookingInfo?.length || 0,
        filteredCount: filtered.length,
        displayMode: displayMode
      })
    }
    
    return filtered
  }, [safeBookingInfo, displayMode])

  // Function to determine if a day should be highlighted
  const dayClassName = useMemo(() => {
    return (day) => {
      const dayBookings = filteredBookings.filter(booking => {
        return isSameCalendarDay(booking.date, day)
      })
      
      // Only log for debugging if there are bookings for this day
      if (process.env.NODE_ENV === 'development' && dayBookings.length > 0) {
        devLog.log('📅 Day has bookings:', {
          day: day.toDateString(),
          bookingCount: dayBookings.length,
          statuses: dayBookings.map(b => b.status).join(',')
        })
      }
      
      if (dayBookings.length === 0) return undefined
      
      // Check if all bookings are pending (status 0)
      const allPending = dayBookings.every(booking => isPendingBooking(booking))
      
      // Check if any booking is confirmed (status 1)  
      const hasConfirmed = dayBookings.some(booking => isConfirmedBooking(booking))
      
      if (hasConfirmed) {
        return highlightClassName // Regular highlight for confirmed bookings
      } else if (allPending) {
        return `${highlightClassName} pending-booking` // Special highlight for pending only
      }
      
      return highlightClassName
    }
  }, [filteredBookings, highlightClassName])

  return {
    filteredBookings,
    dayClassName
  }
}
