/**
 * Determines if a user has an active booking that is currently running.
 * A booking is active if:
 * 1. The current time is between the start time and end time
 * 2. The booking status is "CONFIRMED" (status 1) or "IN_USE" (status 2)
 * 
 * @param {Array} bookingInfo - Array of booking objects with start, end, and status
 * @returns {boolean} - True if there's an active booking right now
 */
import devLog from '@/utils/dev/logger'

export default function isBookingActive(bookingInfo) {
    if (!Array.isArray(bookingInfo)) return false;
    const now = new Date();
  
    return bookingInfo.some(b => {
      if (!b.start || !b.end) return false;
      
      // Confirmed and in-use bookings can be active while their reservation window is open.
      // Support both string and number status formats
      if (b.status !== "1" && b.status !== 1 && b.status !== "2" && b.status !== 2) {
        return false;
      }
      
      // Convert Unix timestamps to Date objects
      const start = new Date(parseInt(b.start) * 1000);
      const end = new Date(parseInt(b.end) * 1000);
      
      // Booking is active only during the reserved time slot and in an active status.
      const isActive = now >= start && now < end;
      
      // Optional debugging for development
      if (process.env.NODE_ENV === 'development' && isActive) {
        devLog.log(`Active booking found:`, {
          labId: b.labId,
          start: start.toLocaleString(),
          end: end.toLocaleString(),
          now: now.toLocaleString(),
          status: b.status
        });
      }
      
      return isActive;
    });
}
