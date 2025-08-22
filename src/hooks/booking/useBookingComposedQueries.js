/**
 * Composed React Query Hooks for Booking/Reservation-related operations
 * These hooks use useQueries to orchestrate multiple related atomic hooks while maintaining
 * React Query's caching, error handling, and retry capabilities
 */
import { useQueries } from '@tanstack/react-query'
import { 
  useReservationsOf,
  useReservation,
  useReservationsOfToken,
  useReservationOfTokenByIndex,
  useReservationKeyOfUserByIndex,
  BOOKING_QUERY_CONFIG, // ✅ Import shared configuration
} from './useBookings'
import { useLab, LAB_QUERY_CONFIG } from '@/hooks/lab/useLabs' // ✅ Import lab hooks
import { useUser } from '@/context/UserContext'
import { bookingQueryKeys, labQueryKeys } from '@/utils/hooks/queryKeys'
import devLog from '@/utils/dev/logger'

/**
 * Composed hook for getting user bookings with enriched details
 * Replicates getUserBookings service as a React Query hook
 * Orchestrates: reservation keys → booking details → optional lab details
 * @param {string} userAddress - User wallet address
 * @param {Object} options - Configuration options
 * @param {boolean} options.includeLabDetails - Whether to fetch lab details for each booking
 * @param {Object} options.queryOptions - Override options for base booking queries only
 *                                        Internal queries use optimized configurations
 * @returns {Object} React Query result with enriched booking data
 */
export const useUserBookingsComposed = (userAddress, { 
  includeLabDetails = false, 
  queryOptions = {} 
} = {}) => {
  
  // Step 1: Get user reservation count using atomic hook
  const reservationCountResult = useReservationsOf(userAddress, {
    ...BOOKING_QUERY_CONFIG,
    // Only allow override of non-critical options like enabled, meta, etc.
    enabled: queryOptions.enabled,
    meta: queryOptions.meta,
  });
  
  // Extract reservation count
  const reservationCount = reservationCountResult.data?.count || 0;
  const hasReservations = reservationCount > 0;

  // Step 2: Get reservation keys for each index
  const reservationKeyResults = useQueries({
    queries: hasReservations 
      ? Array.from({ length: reservationCount }, (_, index) => ({
          queryKey: bookingQueryKeys.reservationKeyOfUserByIndex(userAddress, index),
          queryFn: () => useReservationKeyOfUserByIndex.queryFn(userAddress, index), // ✅ Using atomic hook queryFn
          enabled: !!userAddress && hasReservations,
          ...BOOKING_QUERY_CONFIG,
        }))
      : [],
    combine: (results) => results
  });

  // Extract reservation keys from successful results
  const reservationKeys = reservationKeyResults
    .filter(result => result.isSuccess && result.data)
    .map(result => result.data.reservationKey || result.data); // Handle both formats

  // Step 3: Get booking details for each reservation key
  const bookingDetailsResults = useQueries({
    queries: reservationKeys.length > 0 
      ? reservationKeys.map(key => ({
          queryKey: bookingQueryKeys.byReservationKey(key),
          queryFn: () => useReservation.queryFn(key), // ✅ Using atomic hook queryFn
          enabled: !!key,
          ...BOOKING_QUERY_CONFIG,
        }))
      : [],
    combine: (results) => results
  });

  // Extract raw booking API payloads
  const rawBookingPayloads = bookingDetailsResults
    .filter(result => result.isSuccess && result.data)
    .map(result => {
      const data = result.data;
      // Ensure we have reservationKey in the payload
      return {
        ...data,
        reservationKey: data.reservationKey || reservationKeys[bookingDetailsResults.indexOf(result)]
      };
    });

  // Normalize bookings to flat shape expected by UI (calendar, lists)
  const now = Math.floor(Date.now() / 1000);

  const bookings = rawBookingPayloads.map(payload => {
    // API returns { reservation: {...}, reservationKey }
    const r = payload?.reservation || {};
    // Keep labId as string to match labs.id shape
    const labId = r.labId != null ? r.labId.toString() : undefined;
    const startTime = r.start != null ? parseInt(r.start) : undefined;
    const endTime = r.end != null ? parseInt(r.end) : undefined;
    const statusNumeric = r.status;

    // Derive status category for analytics/filters (keep numeric status for business rules)
    let statusCategory = 'unknown';
    if (statusNumeric === 4 || statusNumeric === '4') {
      statusCategory = 'cancelled';
    } else if (startTime && endTime) {
      if (now < startTime) statusCategory = 'upcoming';
      else if (now >= startTime && now <= endTime) statusCategory = 'active';
      else statusCategory = 'completed';
    }

    // Calendar/list friendly flat object
  const flat = {
      id: payload.reservationKey || undefined,
      reservationKey: payload.reservationKey,
      labId,
      status: statusNumeric, // keep numeric/string code (0,1,2,3,4)
      statusCategory,
      start: startTime,
      end: endTime,
      // date as ISO string (yyyy-mm-dd or full ISO ok; consumers parse via new Date())
      date: startTime ? new Date(startTime * 1000).toISOString() : null,
    };

    return flat;
  });

  // For lab details fetching we need labIds
  const bookingsWithLabIds = bookings.filter(booking => 
    booking.labId !== undefined && booking.labId !== null
  );

  // Step 3: Get lab details for each booking if requested
  const labDetailsResults = useQueries({
    queries: (includeLabDetails && bookingsWithLabIds.length > 0) 
      ? bookingsWithLabIds.map(booking => ({
          queryKey: labQueryKeys.getLab(booking.labId),
          queryFn: () => useLab.queryFn(booking.labId), // ✅ Using atomic hook queryFn
          enabled: !!booking.labId,
          ...LAB_QUERY_CONFIG, // ✅ Lab-specific configuration
          // Note: queryOptions not spread here as LAB_QUERY_CONFIG is optimized for lab data
        }))
      : [],
    combine: (results) => results
  });

  // Process and combine all results
  const isLoading = reservationCountResult.isLoading || 
                   reservationKeyResults.some(result => result.isLoading) ||
                   bookingDetailsResults.some(result => result.isLoading) ||
                   (includeLabDetails && labDetailsResults.some(result => result.isLoading));

  const baseErrors = reservationCountResult.error ? [reservationCountResult.error] : [];
  const keyErrors = reservationKeyResults.filter(result => result.error)
                                         .map(result => result.error);
  const bookingErrors = bookingDetailsResults.filter(result => result.error)
                                            .map(result => result.error);
  const labErrors = labDetailsResults.filter(result => result.error)
                                    .map(result => result.error);
  
  const hasErrors = baseErrors.length > 0;
  const hasPartialErrors = keyErrors.length > 0 || bookingErrors.length > 0 || labErrors.length > 0;

  // Enrich with optional lab details (keep flat shape)
  const enrichedBookings = bookings.map((booking) => {
    if (includeLabDetails && booking.labId) {
      const matchingLabIndex = bookingsWithLabIds.findIndex(b => 
        b.labId === booking.labId && b.reservationKey === booking.reservationKey
      );
      
      if (matchingLabIndex >= 0 && labDetailsResults[matchingLabIndex]?.data) {
        return { ...booking, labDetails: labDetailsResults[matchingLabIndex].data };
      }
    }
    return booking;
  });

  // Calculate aggregates
  const aggregates = {
    totalBookings: enrichedBookings.length,
    activeBookings: enrichedBookings.filter(b => b.statusCategory === 'active').length,
    completedBookings: enrichedBookings.filter(b => b.statusCategory === 'completed').length,
    cancelledBookings: enrichedBookings.filter(b => b.statusCategory === 'cancelled').length,
  };

  return {
    // Data
    data: {
      reservationKeys,
      bookings: enrichedBookings,
      ...aggregates,
    },
    
    // Status
    isLoading,
    isSuccess: !hasErrors && reservationCountResult.isSuccess,
    isError: hasErrors,
    error: baseErrors[0] || null,
    
    // Meta information
    meta: {
      userAddress,
      includeLabDetails,
      reservationCount,
      totalRequested: reservationKeys.length,
      successCount: bookingDetailsResults.filter(r => r.isSuccess).length,
      failedCount: bookingDetailsResults.filter(r => r.error).length,
      hasPartialFailures: hasPartialErrors,
      errors: [...baseErrors, ...keyErrors, ...bookingErrors, ...labErrors],
      timestamp: new Date().toISOString()
    },

    // Individual result access
    baseResult: reservationCountResult,
    reservationKeyResults,
    bookingDetailsResults,
    labDetailsResults,

    // Utility functions
    refetch: () => {
      reservationCountResult.refetch();
      reservationKeyResults.forEach(result => result.refetch && result.refetch());
      bookingDetailsResults.forEach(result => result.refetch && result.refetch());
      labDetailsResults.forEach(result => result.refetch && result.refetch());
    }
  };
};

/**
 * Composed hook for getting lab bookings with enriched data
 * Orchestrates: lab reservations count → reservation keys → reservation details → status enrichment
 * @param {string|number} labId - Lab ID
 * @param {Object} options - Configuration options
 * @param {boolean} options.includeUserDetails - Whether to fetch user details for each booking
 * @param {Object} options.queryOptions - Additional react-query options
 * @returns {Object} React Query result with enriched lab booking data
 */
export const useLabBookingsComposed = (labId, { 
  includeUserDetails = false, 
  queryOptions = {} 
} = {}) => {
  
  // Step 1: Get reservation count for lab
  const reservationCountResult = useReservationsOfToken(labId, {
    ...BOOKING_QUERY_CONFIG,
    enabled: !!labId && (queryOptions.enabled !== false),
    meta: queryOptions.meta,
  });
  
  const reservationCount = reservationCountResult.data?.count || 0;
  
  // Step 2: Get all reservation keys for this lab using indices
  const reservationKeyResults = useQueries({
    queries: reservationCount > 0 
      ? Array.from({ length: reservationCount }, (_, index) => ({
          queryKey: bookingQueryKeys.getReservationOfTokenByIndex(labId, index),
          queryFn: () => useReservationOfTokenByIndex.queryFn(labId, index),
          enabled: !!labId && reservationCount > 0,
          ...BOOKING_QUERY_CONFIG,
        }))
      : [],
    combine: (results) => results
  });
  
  // Extract reservation keys from successful results
  const reservationKeys = reservationKeyResults
    .filter(result => result.isSuccess && result.data?.reservationKey)
    .map(result => result.data.reservationKey);
  
  // Step 3: Get detailed reservation data for each key
  const reservationDetailResults = useQueries({
    queries: reservationKeys.length > 0 
      ? reservationKeys.map(reservationKey => ({
          queryKey: bookingQueryKeys.byReservationKey(reservationKey),
          queryFn: () => useReservation.queryFn(reservationKey),
          enabled: !!reservationKey,
          ...BOOKING_QUERY_CONFIG,
        }))
      : [],
    combine: (results) => results
  });
  
  // Process reservation data and determine statuses
  const now = Math.floor(Date.now() / 1000);
  
  const processedBookings = reservationDetailResults
    .filter(result => result.isSuccess && result.data)
    .map(result => {
      const booking = result.data;
      
      // Extract timestamps (they come as Unix timestamps)
      const startTime = booking.reservation?.start || booking.startTime || booking.start;
      const endTime = booking.reservation?.end || booking.endTime || booking.end;
      
      // Use original contract status (numeric)
      const contractStatus = booking.reservation?.status ?? booking.status ?? 0;

      // Create enriched booking with all required fields for calendar
      const enrichedBooking = {
        ...booking,
        // Required fields for calendar display
        id: booking.reservationKey || booking.id,
        reservationKey: booking.reservationKey,
        labId: parseInt(labId),
        
        // Status
        status: contractStatus,
        
        // Time fields (keep both Unix timestamps and formatted versions)
        start: startTime,
        end: endTime,
        startTime,
        endTime,
        
        // Date field required by calendar (convert from Unix timestamp to YYYY-MM-DD format)
        date: startTime ? new Date(startTime * 1000).toLocaleDateString('en-CA') : null,
        
        // User information
        userAddress: booking.reservation?.renter || booking.userAddress,
      };

      // Add user details formatting if user address exists
      if (includeUserDetails && enrichedBooking.userAddress) {
        enrichedBooking.userDetails = {
          address: enrichedBooking.userAddress,
          displayAddress: `${enrichedBooking.userAddress.slice(0, 6)}...${enrichedBooking.userAddress.slice(-4)}`
        };
      }

      return enrichedBooking;
    });

  // Calculate aggregates using contract status
  const aggregates = {
    totalBookings: processedBookings.length,
    pendingBookings: processedBookings.filter(b => b.status === 0).length,       // PENDING
    confirmedBookings: processedBookings.filter(b => b.status === 1).length,     // BOOKED/CONFIRMED
    usedBookings: processedBookings.filter(b => b.status === 2).length,          // USED
    collectedBookings: processedBookings.filter(b => b.status === 3).length,     // COLLECTED
    cancelledBookings: processedBookings.filter(b => b.status === 4).length,     // CANCELLED
    
    // Legacy aggregates for backward compatibility (using temporal logic)
    activeBookings: processedBookings.filter(b => {
      const now = Math.floor(Date.now() / 1000);
      return b.status === 1 && now >= b.start && now <= b.end;
    }).length,
    completedBookings: processedBookings.filter(b => b.status === 2 || b.status === 3).length,
    upcomingBookings: processedBookings.filter(b => {
      const now = Math.floor(Date.now() / 1000);
      return (b.status === 0 || b.status === 1) && now < b.start;
    }).length,
  };

  // Status calculation
  const isLoading = reservationCountResult.isLoading || 
                   reservationKeyResults.some(r => r.isLoading) ||
                   reservationDetailResults.some(r => r.isLoading);
  
  const isError = reservationCountResult.isError || 
                 reservationKeyResults.some(r => r.isError) ||
                 reservationDetailResults.some(r => r.isError);
  
  const error = reservationCountResult.error || 
               reservationKeyResults.find(r => r.error)?.error ||
               reservationDetailResults.find(r => r.error)?.error;

  return {
    // Data
    data: {
      labId,
      bookings: processedBookings,
      ...aggregates,
    },
    
    // Status
    isLoading,
    isSuccess: !isError && !isLoading && processedBookings.length >= 0,
    isError,
    error,
    
    // Meta information
    meta: {
      includeUserDetails,
      reservationCount,
      totalQueries: 1 + reservationKeyResults.length + reservationDetailResults.length,
      successfulQueries: [reservationCountResult].concat(reservationKeyResults, reservationDetailResults).filter(r => r.isSuccess).length,
      failedQueries: [reservationCountResult].concat(reservationKeyResults, reservationDetailResults).filter(r => r.isError).length,
      timestamp: new Date().toISOString()
    },

    // Individual results for debugging
    baseResults: {
      reservationCount: reservationCountResult,
      reservationKeys: reservationKeyResults,
      reservationDetails: reservationDetailResults
    },

    // Utility functions
    refetch: () => {
      reservationCountResult.refetch();
      reservationKeyResults.forEach(result => result.refetch());
      reservationDetailResults.forEach(result => result.refetch());
    }
  };
};

/**
 * Composed hook for getting bookings for multiple labs with analytics
 * Replicates getMultiLabBookings service as a React Query hook
 * Orchestrates: multiple lab bookings → aggregation → analytics
 * @param {Array<string|number>} labIds - Array of lab IDs
 * @param {Object} options - Configuration options
 * @param {boolean} options.includeAnalytics - Whether to include analytics data
 * @param {Object} options.queryOptions - Additional react-query options
 * @returns {Object} React Query result with multi-lab booking data and analytics
 */
export const useMultiLabBookingsComposed = (labIds, { 
  includeAnalytics = false, 
  queryOptions = {} 
} = {}) => {
  
  // Always call useQueries, even with empty array to avoid conditional hook calls
  const labBookingResults = useQueries({
    queries: (Array.isArray(labIds) && labIds.length > 0) ? labIds.map(labId => ({
      queryKey: bookingQueryKeys.getReservationsOfToken(labId),
      queryFn: async () => {
        const data = await useReservationsOfToken.queryFn(labId); // ✅ Using atomic hook queryFn
        return { labId, data: data.data || data.reservations || [] };
      },
      enabled: !!labId,
      ...BOOKING_QUERY_CONFIG, // ✅ Booking-specific configuration
      // Note: queryOptions not spread here as BOOKING_QUERY_CONFIG is optimized for booking data
    })) : [],
    combine: (results) => results
  });

  // Validate input and return early if invalid (but after hook calls)
  if (!Array.isArray(labIds) || labIds.length === 0) {
    return {
      data: {
        labBookings: {},
        aggregates: {
          totalLabs: 0,
          totalBookings: 0,
          totalActiveBookings: 0,
          totalUpcomingBookings: 0,
          totalCompletedBookings: 0,
          averageBookingsPerLab: 0
        },
        analytics: includeAnalytics ? {
          busiestLabs: [],
          quietestLabs: [],
          utilizationRates: {}
        } : null
      },
      isLoading: false,
      isSuccess: true,
      isError: false,
      error: null,
      meta: {
        labIds: [],
        hasPartialFailures: false,
        errors: []
      }
    };
  }

  // Process results
  const isLoading = labBookingResults.some(result => result.isLoading);
  const errors = labBookingResults.filter(result => result.error).map(result => result.error);
  const hasErrors = errors.length === labBookingResults.length; // Only error if ALL failed
  const hasPartialErrors = errors.length > 0 && errors.length < labBookingResults.length;

  // Build lab bookings data
  const labBookings = {};
  const successfulLabs = [];
  
  labBookingResults.forEach((result, index) => {
    const labId = labIds[index];
    
    if (result.isSuccess && result.data) {
      // Extract array from the count response - for now return empty array since endpoint only returns count
      const rawBookingsData = result.data || {};
      const rawBookings = Array.isArray(rawBookingsData) ? rawBookingsData : [];
      const now = Math.floor(Date.now() / 1000);
      
      // Process bookings with status determination
      const processedBookings = rawBookings.map(booking => {
        const startTime = booking.startTime || booking.start;
        const endTime = booking.endTime || booking.end;
        
        let status = booking.status;
        if (!status) {
          if (booking.cancelled) {
            status = 'cancelled';
          } else if (now < startTime) {
            status = 'upcoming';
          } else if (now >= startTime && now <= endTime) {
            status = 'active';
          } else {
            status = 'completed';
          }
        }

        return { ...booking, status, statusCategory: status };
      });

      // Calculate lab-specific aggregates
      const labData = {
        labId,
        bookings: processedBookings,
        totalBookings: processedBookings.length,
        activeBookings: processedBookings.filter(b => b.statusCategory === 'active').length,
        upcomingBookings: processedBookings.filter(b => b.statusCategory === 'upcoming').length,
        completedBookings: processedBookings.filter(b => b.statusCategory === 'completed').length,
        cancelledBookings: processedBookings.filter(b => b.statusCategory === 'cancelled').length,
      };

      labBookings[labId] = labData;
      successfulLabs.push(labData);
    } else {
      // Add failed lab with empty data
      labBookings[labId] = {
        labId,
        bookings: [],
        totalBookings: 0,
        activeBookings: 0,
        upcomingBookings: 0, 
        completedBookings: 0,
        cancelledBookings: 0,
        error: result.error?.message || 'Unknown error',
        failed: true
      };
    }
  });

  // Calculate overall aggregates
  const aggregates = {
    totalLabs: labIds.length,
    totalBookings: successfulLabs.reduce((sum, lab) => sum + lab.totalBookings, 0),
    totalActiveBookings: successfulLabs.reduce((sum, lab) => sum + lab.activeBookings, 0),
    totalUpcomingBookings: successfulLabs.reduce((sum, lab) => sum + lab.upcomingBookings, 0),
    totalCompletedBookings: successfulLabs.reduce((sum, lab) => sum + lab.completedBookings, 0),
    averageBookingsPerLab: successfulLabs.length > 0 ? 
      Math.round((successfulLabs.reduce((sum, lab) => sum + lab.totalBookings, 0) / successfulLabs.length) * 100) / 100 : 0
  };

  // Generate analytics if requested
  let analytics = null;
  if (includeAnalytics && successfulLabs.length > 0) {
    const labStats = successfulLabs
      .map(lab => ({
        labId: lab.labId,
        totalBookings: lab.totalBookings,
        activeBookings: lab.activeBookings,
        utilizationRate: lab.totalBookings > 0 ? 
          Math.round((lab.activeBookings / lab.totalBookings) * 100) : 0
      }))
      .sort((a, b) => b.totalBookings - a.totalBookings);

    analytics = {
      busiestLabs: labStats.slice(0, 3),
      quietestLabs: labStats.slice(-3).reverse(),
      utilizationRates: {}
    };
    
    labStats.forEach(stat => {
      analytics.utilizationRates[stat.labId] = stat.utilizationRate;
    });
  }

  return {
    // Data
    data: {
      labBookings,
      aggregates,
      analytics
    },
    
    // Status
    isLoading,
    isSuccess: !hasErrors && successfulLabs.length > 0,
    isError: hasErrors,
    error: hasErrors ? errors[0] : null,
    
    // Meta information
    meta: {
      labIds,
      includeAnalytics,
      totalRequested: labIds.length,
      successCount: successfulLabs.length,
      failedCount: labIds.length - successfulLabs.length,
      hasPartialFailures: hasPartialErrors,
      errors,
      timestamp: new Date().toISOString()
    },

    // Individual result access
    labBookingResults,

    // Utility functions
    refetch: () => {
      labBookingResults.forEach(result => result.refetch && result.refetch());
    }
  };
};

/**
 * Hook for current user's bookings with details (uses UserContext)
 * Convenience hook that automatically gets current user's address
 * @param {Object} options - Configuration options
 * @returns {Object} React Query result with current user's bookings
 */
export const useCurrentUserBookingsComposed = (options = {}) => {
  const { userAddress } = useUser();
  return useUserBookingsComposed(userAddress, options);
};

/**
 * Cache extraction helper for finding a specific booking from user bookings
 * @param {Object} userBookingsResult - Result from useUserBookingsComposed
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

// Module loaded confirmation (only logs once even in StrictMode)
devLog.moduleLoaded('✅ Booking composed hooks loaded');
