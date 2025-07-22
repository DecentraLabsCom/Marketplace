/**
 * Determines if a user has an active booking that is currently running.
 * A booking is active if the current time is between the start time and end time.
 * The purple hover effect and access button should only show during this active period.
 * 
 * @param {Array} bookingInfo - Array of booking objects
 * @returns {boolean} - True if there's an active booking right now
 */
import { devLog } from '@/utils/logger';

export default function isBookingActive(bookingInfo) {
    if (!Array.isArray(bookingInfo)) return false;
    const now = new Date();
  
    return bookingInfo.some(b => {
      if (!b.start || !b.end) return false;
      
      // Convert Unix timestamps to Date objects
      const start = new Date(parseInt(b.start) * 1000);
      const end = new Date(parseInt(b.end) * 1000);
      
      // Booking is active only during the reserved time slot
      const isActive = now >= start && now < end;
      
      // Optional debugging for development
      if (process.env.NODE_ENV === 'development' && isActive) {
        devLog.log(`Active booking found:`, {
          labId: b.labId,
          start: start.toLocaleString(),
          end: end.toLocaleString(),
          now: now.toLocaleString()
        });
      }
      
      return isActive;
    });
}
