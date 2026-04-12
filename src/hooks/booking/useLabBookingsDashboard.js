/**
 * Composed React Query Hook for lab bookings dashboard (provider view)
 * Orchestrates: lab reservations count → reservation keys → reservation details → status enrichment
 * Provides booking summary analytics and user details for provider dashboard components
 *
 * ARCHITECTURE: Lab-centric reads are session-agnostic (public data).
 */
import { useQueries, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import {
  useReservationsOfToken,
  useReservationSSO,
  useReservationOfTokenByIndexSSO,
  BOOKING_QUERY_CONFIG,
} from './useBookingAtomicQueries'
import { bookingQueryKeys } from '@/utils/hooks/queryKeys'
import { calculateBookingSummary } from '@/utils/booking/dashboardSummary'
import devLog from '@/utils/dev/logger'

/**
 * Dashboard-focused hook for getting lab bookings with enriched data and analytics
 * Orchestrates: lab reservations count → reservation keys → reservation details → status enrichment
 * Provides booking summary analytics and user details for provider dashboard components
 * @param {string|number} labId - Lab ID
 * @param {Object} options - Configuration options
 * @param {boolean} options.includeUserDetails - Whether to fetch user details for each booking
 * @param {Object} options.queryOptions - Additional react-query options
 * @returns {Object} React Query result with enriched lab booking data and analytics summary
 */
export const useLabBookingsDashboard = (labId, { 
  includeUserDetails = false, 
  queryOptions = {} 
} = {}) => {
  
  // ARCHITECTURE: This hook queries lab reservations (public data, not user-specific).
  // Uses API-based queryFn for useQueries compatibility because hook-based readers cannot be extracted.
  // Lab-centric reads are session-agnostic because they do not depend on customer wallet state.
  
  // Debug log for input parameters
  devLog.log('📅 useLabBookingsDashboard called with:', {
    labId,
    includeUserDetails,
    queryMode: 'API-based (required for useQueries)',
    reason: 'Lab reservations are public data, queryFn must be extractable'
  });
  
  // Step 1: Get reservation count for lab (uses API path for useQueries compatibility)
  const reservationCountResult = useReservationsOfToken(labId, {
    ...BOOKING_QUERY_CONFIG,
    enabled: !!labId && (queryOptions.enabled !== false),
    meta: queryOptions.meta,
    isSSO: true, // Use API path (required: useQueries needs extractable queryFn)
  });
  
  const reservationCount = reservationCountResult.data?.count || 0;
  // Temporary compatibility seam.
  // Remove this branch when Reservation_Reads_Compatibility restores
  // enumerable reservation reads for provider calendars.
  const canEnumerateLabReservations = reservationCountResult.data?.enumerableReservations !== false;
  
  // Debug log for reservation count
  devLog.log('📊 Lab reservations count:', {
    labId,
    reservationCount,
    isLoading: reservationCountResult.isLoading,
    isError: reservationCountResult.isError,
    error: reservationCountResult.error,
    data: reservationCountResult.data
  });
  
  // Step 2: Get all reservation keys for this lab using indices
  const reservationKeyResults = useQueries({
    queries: canEnumerateLabReservations && reservationCount > 0 
      ? Array.from({ length: reservationCount }, (_, index) => ({
          queryKey: bookingQueryKeys.getReservationOfTokenByIndex(labId, index),
          queryFn: () => useReservationOfTokenByIndexSSO.queryFn(labId, index),
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
  
  // Debug log for reservation keys
  devLog.log('🔑 Lab reservation keys:', {
    labId,
    reservationKeys,
    reservationKeyResults: reservationKeyResults.map(r => ({
      isSuccess: r.isSuccess,
      isError: r.isError,
      data: r.data,
      error: r.error
    }))
  });
  
  // Step 3: Get detailed reservation data for each key
  const reservationDetailResults = useQueries({
    queries: canEnumerateLabReservations && reservationKeys.length > 0 
      ? reservationKeys.map(reservationKey => ({
          queryKey: bookingQueryKeys.byReservationKey(reservationKey),
          queryFn: () => useReservationSSO.queryFn(reservationKey),
          enabled: !!reservationKey,
          ...BOOKING_QUERY_CONFIG,
        }))
      : [],
    combine: (results) => results
  });
  
  // Process reservation data and determine statuses
  const now = Math.floor(Date.now() / 1000);
  
  // Get optimistic bookings from cache for this lab
  const queryClient = useQueryClient();
  const optimisticBookings = queryClient.getQueryData(bookingQueryKeys.byLab(labId)) || [];
  const optimisticOnly = optimisticBookings.filter(booking => booking.isOptimistic === true);
  
  devLog.log('🔄 Optimistic bookings for lab:', {
    labId,
    optimisticCount: optimisticOnly.length,
    optimisticBookings: optimisticOnly.map(b => ({
      id: b.id,
      start: b.start,
      isPending: b.isPending
    }))
  });
  
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

  // Debug log for processed bookings
  devLog.log('📋 Processed lab bookings:', {
    labId,
    processedBookingsCount: processedBookings.length,
    processedBookings: processedBookings.map(b => ({
      id: b.id,
      reservationKey: b.reservationKey,
      status: b.status,
      start: b.start,
      end: b.end,
      date: b.date,
      userAddress: b.userAddress
    })),
    reservationDetailResults: reservationDetailResults.map(r => ({
      isSuccess: r.isSuccess,
      isError: r.isError,
      data: r.data ? {
        reservationKey: r.data.reservationKey,
        reservation: r.data.reservation
      } : null,
      error: r.error
    }))
  });

  // Calculate aggregates using utility function 
  const aggregates = calculateBookingSummary(processedBookings, {
    includeUpcoming: true,
    includeCancelled: true
  });

  // Add lab-specific status aggregates
  const labSpecificAggregates = {
    pendingBookings: processedBookings.filter(b => b.status === 0).length,       // PENDING
    confirmedBookings: processedBookings.filter(b => b.status === 1).length,     // BOOKED/CONFIRMED
    usedBookings: processedBookings.filter(b => b.status === 2).length,          // USED
    collectedBookings: processedBookings.filter(b => b.status === 3).length,     // COLLECTED
  };

  // Combine standard and lab-specific aggregates
  const combinedAggregates = { ...aggregates, ...labSpecificAggregates };

  // Merge optimistic bookings with processed bookings (following granular cache pattern)
  const allBookings = useMemo(() => {
    // Filter out optimistic bookings that have been replaced by real ones
    const filteredOptimistic = optimisticOnly.filter(optBooking => {
      const isDuplicate = processedBookings.some(realBooking => {
        const realStart = parseInt(realBooking.start);
        const optStart = parseInt(optBooking.start);
        return realBooking.labId?.toString() === optBooking.labId?.toString() &&
               Math.abs(realStart - optStart) < 60; // Within 1 minute tolerance
      });
      return !isDuplicate;
    });
    
    if (filteredOptimistic.length > 0) {
      devLog.log('✨ Including optimistic bookings in lab bookings:', {
        labId,
        optimisticCount: filteredOptimistic.length,
        totalCount: processedBookings.length + filteredOptimistic.length
      });
    }
    
    return [...processedBookings, ...filteredOptimistic];
  }, [processedBookings, optimisticOnly, labId]);

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
      bookings: allBookings,
      ...combinedAggregates,
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
      reservationsEnumerable: canEnumerateLabReservations,
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
