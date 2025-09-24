/**
 * Specialized Booking Hooks - Optimized for specific use cases
 * These hooks use atomic queries + React Query 'select' for maximum performance
 */
import { 
  useReservationsOf, 
  BOOKING_QUERY_CONFIG 
} from './useBookingAtomicQueries'
import devLog from '@/utils/dev/logger'

/**
 * Specialized hook for Market component
 * Uses only the atomic reservationsOf query with select optimization
 * Only returns basic booking info needed for lab filtering (active bookings detection)
 * @param {string} userAddress - User wallet address
 * @param {Object} options - Configuration options
 * @returns {Object} Minimal booking data for market filtering
 */
export const useUserBookingsForMarket = (userAddress, options = {}) => {
  return useReservationsOf(userAddress, {
    ...BOOKING_QUERY_CONFIG,
    ...options.queryOptions,
    enabled: !!userAddress && (options.enabled !== false) && (options.queryOptions?.enabled !== false),
    
    // ✅ Use React Query 'select' to transform data at query level (no re-renders)
    select: (rawReservations) => {
      devLog.log('🏪 useUserBookingsForMarket - Processing reservations:', {
        userAddress,
        reservationCount: rawReservations?.length || 0
      });

      if (!rawReservations?.length) {
        return {
          userLabsWithActiveBookings: new Set(), // ✅ Set for O(1) lab marking
          activeBookingsCount: 0,
          upcomingBookingsCount: 0,
          hasBookingInLab: () => false
        };
      }

      const now = Math.floor(Date.now() / 1000);
      const userLabsWithActiveBookings = new Set();
      let activeBookingsCount = 0;
      let upcomingBookingsCount = 0;

      // ✅ Only extract lab IDs for active/upcoming bookings (for halo marking)
      rawReservations.forEach(reservation => {
        const start = parseInt(reservation.start);
        const end = parseInt(reservation.end);
        const status = parseInt(reservation.status);
        
        // Skip cancelled bookings
        if (status === 4) return;
        
        if (start <= now && now <= end && status === 1) {
          // Active booking
          userLabsWithActiveBookings.add(reservation.labId);
          activeBookingsCount++;
        } else if (start > now && (status === 0 || status === 1)) {
          // Upcoming booking
          userLabsWithActiveBookings.add(reservation.labId);
          upcomingBookingsCount++;
        }
      });

      devLog.log('🏪 useUserBookingsForMarket - Result:', {
        activeBookingsCount,
        upcomingBookingsCount,
        labsWithBookings: Array.from(userLabsWithActiveBookings)
      });

      return {
        userLabsWithActiveBookings, // ✅ Set of lab IDs for O(1) checking in Market
        activeBookingsCount,
        upcomingBookingsCount,
        // ✅ Helper method for easy checking in components
        hasBookingInLab: (labId) => userLabsWithActiveBookings.has(labId?.toString())
      };
    }
  });
};

/**
 * Specialized hook for calendar availability checking
 * Uses only the atomic reservationsOf query for user bookings
 * @param {string} userAddress - User wallet address  
 * @param {string|number} labId - Lab ID for lab-specific bookings (not used in this version)
 * @param {Object} options - Configuration options
 * @returns {Object} User booking data for calendar slot validation
 */
export const useBookingsForCalendar = (userAddress, labId, options = {}) => {
  return useReservationsOf(userAddress, {
    ...BOOKING_QUERY_CONFIG,
    ...options.queryOptions,
    enabled: !!userAddress && (options.enabled !== false) && (options.queryOptions?.enabled !== false),
    
    // ✅ Use React Query 'select' for calendar-specific data transformation
    select: (rawReservations) => {
      devLog.log('📅 useBookingsForCalendar - Processing reservations:', {
        userAddress,
        labId,
        reservationCount: rawReservations?.length || 0
      });

      if (!rawReservations?.length) {
        return {
          userBookings: [],
          totalUserBookings: 0
        };
      }

      // Extract minimal data needed for calendar slot checking
      const calendarBookings = rawReservations
        .filter(reservation => 
          // Only include non-cancelled bookings for availability checking
          parseInt(reservation.status) !== 4
        )
        .map(reservation => ({
          id: reservation.reservationKey,
          labId: reservation.labId,
          start: reservation.start,
          end: reservation.end,
          status: reservation.status,
          date: reservation.date || new Date(parseInt(reservation.start) * 1000).toLocaleDateString('en-CA'),
          // Add type to distinguish user vs lab bookings
          type: 'user'
        }));

      devLog.log('📅 useBookingsForCalendar - Result:', {
        totalBookings: calendarBookings.length,
        labIds: [...new Set(calendarBookings.map(b => b.labId))]
      });

      return {
        userBookings: calendarBookings,
        totalUserBookings: calendarBookings.length
      };
    }
  });
};

/**
 * Hook for getting only active user bookings (for dashboard "active now" section)
 * More efficient than full dashboard data when you only need current active booking
 * @param {string} userAddress - User wallet address
 * @param {Object} options - Configuration options  
 * @returns {Object} Active booking data - NOTE: lab details need to be fetched separately
 */
export const useActiveUserBooking = (userAddress, options = {}) => {
  return useReservationsOf(userAddress, {
    ...BOOKING_QUERY_CONFIG,
    ...options.queryOptions,
    enabled: !!userAddress && (options.enabled !== false) && (options.queryOptions?.enabled !== false),
    
    // ✅ Use React Query 'select' to extract only active/next bookings
    select: (rawReservations) => {
      devLog.log('🎯 useActiveUserBooking - Processing reservations:', {
        userAddress,
        reservationCount: rawReservations?.length || 0
      });

      if (!rawReservations?.length) {
        return {
          activeBooking: null,
          nextBooking: null,
          hasActiveBooking: false,
          hasUpcomingBooking: false
        };
      }

      const now = Math.floor(Date.now() / 1000);
      
      // Find current active booking
      const activeBooking = rawReservations.find(reservation => {
        const start = parseInt(reservation.start);
        const end = parseInt(reservation.end);
        const status = parseInt(reservation.status);
        
        return status === 1 && start <= now && end >= now;
      }) || null;

      // Find next upcoming booking (if no active booking)
      const nextBooking = !activeBooking ? rawReservations
        .filter(reservation => {
          const start = parseInt(reservation.start);
          const status = parseInt(reservation.status);
          
          return (status === 0 || status === 1) && start > now;
        })
        .sort((a, b) => parseInt(a.start) - parseInt(b.start))[0] || null : null;

      devLog.log('🎯 useActiveUserBooking - Result:', {
        hasActiveBooking: !!activeBooking,
        hasUpcomingBooking: !!nextBooking,
        activeLabId: activeBooking?.labId,
        nextLabId: nextBooking?.labId
      });

      return {
        activeBooking,
        nextBooking,
        hasActiveBooking: !!activeBooking,
        hasUpcomingBooking: !!nextBooking
      };
    }
  });
};

/**
 * Specialized hook for BookingSummarySection
 * Gets only booking analytics without lab details or individual bookings
 * Optimized for dashboard summary cards
 * @param {string} userAddress - User wallet address
 * @param {Object} options - Configuration options
 * @returns {Object} Booking analytics summary only
 */
export const useUserBookingSummary = (userAddress, options = {}) => {
  return useReservationsOf(userAddress, {
    ...BOOKING_QUERY_CONFIG,
    ...options.queryOptions,
    enabled: !!userAddress && (options.enabled !== false),
    
    // ✅ Transform to summary analytics only
    select: (rawReservations) => {
      if (!rawReservations?.length) {
        return {
          totalBookings: 0,
          activeBookings: 0,
          upcomingBookings: 0,
          completedBookings: 0,
          cancelledBookings: 0,
          pendingBookings: 0
        };
      }

      const now = Math.floor(Date.now() / 1000);
      const summary = {
        totalBookings: rawReservations.length,
        activeBookings: 0,
        upcomingBookings: 0,
        completedBookings: 0,
        cancelledBookings: 0,
        pendingBookings: 0
      };

      rawReservations.forEach(reservation => {
        const start = parseInt(reservation.start);
        const end = parseInt(reservation.end);
        const status = parseInt(reservation.status);
        
        if (status === 4) {
          summary.cancelledBookings++;
        } else if (status === 0) {
          summary.pendingBookings++;
        } else if (status === 2 || status === 3) {
          summary.completedBookings++;
        } else if (status === 1) {
          if (start && end) {
            if (now >= start && now <= end) {
              summary.activeBookings++;
            } else if (now < start) {
              summary.upcomingBookings++;
            } else {
              summary.completedBookings++;
            }
          } else {
            summary.upcomingBookings++;
          }
        }
      });

      devLog.log('📊 useUserBookingSummary - Analytics only:', summary);
      return summary;
    }
  });
};

/**
 * Specialized hook for ActiveBookingSection
 * Gets current active and next upcoming booking with minimal lab enrichment
 * @param {string} userAddress - User wallet address
 * @param {Object} options - Configuration options
 * @returns {Object} Active and next booking with basic lab data
 */
export const useUserActiveBookings = (userAddress, options = {}) => {
  return useReservationsOf(userAddress, {
    ...BOOKING_QUERY_CONFIG,
    ...options.queryOptions,
    enabled: !!userAddress && (options.enabled !== false),
    
    // ✅ Extract only active and next booking
    select: (rawReservations) => {
      if (!rawReservations?.length) {
        return {
          activeBooking: null,
          nextBooking: null,
          hasActiveBooking: false
        };
      }

      const now = Math.floor(Date.now() / 1000);
      let activeBooking = null;
      let nextBooking = null;

      // Find current active booking
      const activeReservation = rawReservations.find(reservation => {
        const start = parseInt(reservation.start);
        const end = parseInt(reservation.end);
        const status = parseInt(reservation.status);
        
        return status === 1 && start <= now && end >= now;
      });

      if (activeReservation) {
        activeBooking = {
          id: activeReservation.reservationKey,
          reservationKey: activeReservation.reservationKey,
          labId: activeReservation.labId,
          status: activeReservation.status,
          start: activeReservation.start,
          end: activeReservation.end,
          date: new Date(parseInt(activeReservation.start) * 1000).toISOString()
        };
      }

      // Find next upcoming booking (if no active booking)
      if (!activeBooking) {
        const upcomingReservations = rawReservations
          .filter(reservation => {
            const start = parseInt(reservation.start);
            const status = parseInt(reservation.status);
            
            return (status === 0 || status === 1) && start > now;
          })
          .sort((a, b) => parseInt(a.start) - parseInt(b.start));

        if (upcomingReservations.length > 0) {
          const nextReservation = upcomingReservations[0];
          nextBooking = {
            id: nextReservation.reservationKey,
            reservationKey: nextReservation.reservationKey,
            labId: nextReservation.labId,
            status: nextReservation.status,
            start: nextReservation.start,
            end: nextReservation.end,
            date: new Date(parseInt(nextReservation.start) * 1000).toISOString()
          };
        }
      }

      devLog.log('🎯 useUserActiveBookings - Active/Next only:', {
        hasActive: !!activeBooking,
        hasNext: !!nextBooking,
        activeLabId: activeBooking?.labId,
        nextLabId: nextBooking?.labId
      });

      return {
        activeBooking,
        nextBooking,
        hasActiveBooking: !!activeBooking
      };
    }
  });
};

// Module loaded confirmation
devLog.moduleLoaded('✅ Booking specialized hooks loaded');
