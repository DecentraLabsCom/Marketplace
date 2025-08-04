/**
 * React Query Hooks for Booking-related data
 * Uses simple hooks with composed services and cache-extracting hooks
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { bookingServices } from '@/services/bookingServices'
import { QUERY_KEYS } from '@/utils/hooks/queryKeys'
import devLog from '@/utils/dev/logger'
import { useMemo } from 'react'

// ===============================
// === MAIN COMPOSED HOOKS ===
// ===============================

/**
 * Hook to get all user bookings in a single composed call
 * This is the primary data source for user booking data
 * @param {string} userAddress - User's wallet address
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with user bookings composed data
 */
export const useUserBookingsQuery = (userAddress, options = {}) => {
  return useQuery({
    queryKey: QUERY_KEYS.BOOKINGS.userComposed(userAddress, true), // Always use true for consistent cache
    queryFn: () => bookingServices.fetchUserBookingsComposed(userAddress, true),
    enabled: !!userAddress,
    staleTime: 15 * 60 * 1000, // 15 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    refetchOnWindowFocus: false,
    refetchInterval: false,
    retry: 2,
    ...options,
  });
};

/**
 * Hook to get all lab bookings in a single composed call
 * This is the primary data source for lab booking data
 * @param {string|number} labId - Lab identifier
 * @param {boolean} includeMetrics - Whether to calculate occupancy metrics
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with lab bookings composed data
 */
export const useLabBookingsQuery = (labId, includeMetrics = true, options = {}) => {
  return useQuery({
    queryKey: QUERY_KEYS.BOOKINGS.labComposed(labId, includeMetrics),
    queryFn: () => bookingServices.fetchLabBookingsComposed(labId, includeMetrics),
    enabled: !!labId,
    staleTime: 15 * 60 * 1000, // 15 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    refetchOnWindowFocus: false,
    refetchInterval: false,
    retry: 2,
    ...options,
  });
};

/**
 * Hook to get multi-lab bookings in a single composed call
 * Efficiently fetches bookings for multiple labs in parallel
 * @param {Array<string|number>} labIds - Array of lab IDs
 * @param {boolean} includeMetrics - Whether to include metrics for each lab
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with multi-lab bookings data
 */
export const useMultiLabBookingsQuery = (labIds, includeMetrics = false, options = {}) => {
  return useQuery({
    queryKey: QUERY_KEYS.BOOKINGS.multiLab(labIds, includeMetrics),
    queryFn: () => bookingServices.fetchMultiLabBookingsComposed(labIds, includeMetrics),
    enabled: Array.isArray(labIds) && labIds.length > 0,
    staleTime: 15 * 60 * 1000, // 15 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    refetchOnWindowFocus: false,
    refetchInterval: false,
    retry: 2,
    ...options,
  });
};

// ===============================
// === ATOMIC HOOKS (for specific use cases) ===
// ===============================

/**
 * Hook to get atomic user bookings (when you only need basic booking data)
 * @param {string} userAddress - User's wallet address
 * @param {boolean} clearCache - Whether to bypass cache
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with atomic user bookings
 */
export const useUserBookingsAtomicQuery = (userAddress, clearCache = false, options = {}) => {
  return useQuery({
    queryKey: QUERY_KEYS.BOOKINGS.userAtomic(userAddress, clearCache),
    queryFn: () => bookingServices.fetchUserBookings(userAddress, clearCache),
    enabled: !!userAddress,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 2,
    ...options,
  });
};

/**
 * Hook to get atomic lab bookings (when you only need basic booking data)
 * @param {string|number} labId - Lab identifier
 * @param {boolean} clearCache - Whether to bypass cache
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with atomic lab bookings
 */
export const useLabBookingsAtomicQuery = (labId, clearCache = false, options = {}) => {
  return useQuery({
    queryKey: QUERY_KEYS.BOOKINGS.labAtomic(labId, clearCache),
    queryFn: () => bookingServices.fetchLabBookings(labId, clearCache),
    enabled: !!labId,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 2,
    ...options,
  });
};

// ===============================
// === CACHE-EXTRACTING HOOKS (simple data operations) ===
// ===============================

/**
 * Hook to get user bookings list (extracts from composed data)
 * @param {string} userAddress - User's wallet address
 * @returns {Object} Bookings list with loading and error states
 */
export const useUserBookingsListQuery = (userAddress) => {
  const userBookingsQuery = useUserBookingsQuery(userAddress);
  
  return useMemo(() => ({
    data: userBookingsQuery.data?.bookings || [],
    totalBookings: userBookingsQuery.data?.totalBookings || 0,
    activeBookings: userBookingsQuery.data?.activeBookings || 0,
    pastBookings: userBookingsQuery.data?.pastBookings || 0,
    errorInfo: userBookingsQuery.data?.errorInfo || { hasErrors: false, message: '' },
    isLoading: userBookingsQuery.isLoading,
    isPending: userBookingsQuery.isPending,
    isInitialLoading: userBookingsQuery.isInitialLoading,
    isFetching: userBookingsQuery.isFetching,
    isSuccess: userBookingsQuery.isSuccess,
    isError: userBookingsQuery.isError,
    error: userBookingsQuery.error,
    refetch: userBookingsQuery.refetch,
  }), [userBookingsQuery]);
};

/**
 * Hook to get lab bookings list (extracts from composed data)
 * @param {string|number} labId - Lab identifier
 * @param {boolean} includeMetrics - Whether to include metrics
 * @returns {Object} Bookings list with loading and error states
 */
export const useLabBookingsListQuery = (labId, includeMetrics = true) => {
  const labBookingsQuery = useLabBookingsQuery(labId, includeMetrics);
  
  return useMemo(() => ({
    data: labBookingsQuery.data?.bookings || [],
    totalBookings: labBookingsQuery.data?.totalBookings || 0,
    metrics: labBookingsQuery.data?.metrics || null,
    errorInfo: labBookingsQuery.data?.errorInfo || { hasErrors: false, message: '' },
    isLoading: labBookingsQuery.isLoading,
    isPending: labBookingsQuery.isPending,
    isInitialLoading: labBookingsQuery.isInitialLoading,
    isFetching: labBookingsQuery.isFetching,
    isSuccess: labBookingsQuery.isSuccess,
    isError: labBookingsQuery.isError,
    error: labBookingsQuery.error,
    refetch: labBookingsQuery.refetch,
  }), [labBookingsQuery]);
};

/**
 * Hook to get single booking from user cache (simple find operation)
 * @param {string} userAddress - User's wallet address
 * @param {string} bookingId - Booking ID to find
 * @returns {Object} Single booking with loading and error states
 */
export const useUserBookingQuery = (userAddress, bookingId) => {
  const userBookingsQuery = useUserBookingsQuery(userAddress);
  
  return useMemo(() => {
    const booking = userBookingsQuery.data?.bookings?.find(b => b.id === bookingId || b.reservationKey === bookingId);
    return {
      data: booking || null,
      isLoading: userBookingsQuery.isLoading,
      isPending: userBookingsQuery.isPending,
      isInitialLoading: userBookingsQuery.isInitialLoading,
      isFetching: userBookingsQuery.isFetching,
      isSuccess: userBookingsQuery.isSuccess,
      isError: userBookingsQuery.isError,
      error: userBookingsQuery.error,
      refetch: userBookingsQuery.refetch,
    };
  }, [userBookingsQuery, bookingId]);
};

/**
 * Hook to get single booking from lab cache (simple find operation)
 * @param {string|number} labId - Lab identifier
 * @param {string} bookingId - Booking ID to find
 * @returns {Object} Single booking with loading and error states
 */
export const useLabBookingQuery = (labId, bookingId) => {
  const labBookingsQuery = useLabBookingsQuery(labId);
  
  return useMemo(() => {
    const booking = labBookingsQuery.data?.bookings?.find(b => b.id === bookingId || b.reservationKey === bookingId);
    return {
      data: booking || null,
      isLoading: labBookingsQuery.isLoading,
      isPending: labBookingsQuery.isPending,
      isInitialLoading: labBookingsQuery.isInitialLoading,
      isFetching: labBookingsQuery.isFetching,
      isSuccess: labBookingsQuery.isSuccess,
      isError: labBookingsQuery.isError,
      error: labBookingsQuery.error,
      refetch: labBookingsQuery.refetch,
    };
  }, [labBookingsQuery, bookingId]);
};

// ===============================
// === MUTATIONS ===
// ===============================

/**
 * Hook to create a booking with optimistic updates
 * @returns {Object} React Query mutation object for creating bookings
 */
export const useCreateBookingMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bookingData) => bookingServices.createBooking(bookingData),
    
    onMutate: async (bookingData) => {
      const { labId, userAddress, start, timeslot } = bookingData;
      devLog.log('Creating booking optimistically...');
      
      // Cancel outgoing queries to avoid overwriting optimistic update
      if (userAddress) {
        await queryClient.cancelQueries({ 
          queryKey: QUERY_KEYS.BOOKINGS.userComposed(userAddress, true) 
        });
      }
      await queryClient.cancelQueries({ 
        queryKey: QUERY_KEYS.BOOKINGS.labComposed(labId) 
      });
      
      // Create optimistic booking
      const optimisticBooking = {
        id: `temp_${Date.now()}`,
        labId: labId.toString(),
        userAddress,
        start: start.toString(),
        end: (start + timeslot).toString(), // Calculate end time
        status: '1', // Active status
        reservationKey: `temp_key_${Date.now()}`,
        createdAt: Math.floor(Date.now() / 1000).toString(),
      };
      
      // Snapshot and update user bookings (only if userAddress provided)
      const previousUserBookings = userAddress ? 
        queryClient.getQueryData(QUERY_KEYS.BOOKINGS.userComposed(userAddress, true)) : null;
      if (previousUserBookings && userAddress) {
        queryClient.setQueryData(
          QUERY_KEYS.BOOKINGS.userComposed(userAddress, true),
          {
            ...previousUserBookings,
            bookings: [...(previousUserBookings.bookings || []), optimisticBooking],
            totalBookings: (previousUserBookings.totalBookings || 0) + 1,
            activeBookings: (previousUserBookings.activeBookings || 0) + 1
          }
        );
      }
      
      // Snapshot and update lab bookings
      const previousLabBookings = queryClient.getQueryData(QUERY_KEYS.BOOKINGS.labComposed(labId));
      if (previousLabBookings) {
        queryClient.setQueryData(
          QUERY_KEYS.BOOKINGS.labComposed(labId),
          {
            ...previousLabBookings,
            bookings: [...(previousLabBookings.bookings || []), optimisticBooking],
            totalBookings: (previousLabBookings.totalBookings || 0) + 1,
            metrics: {
              ...previousLabBookings.metrics,
              activeBookings: (previousLabBookings.metrics?.activeBookings || 0) + 1
            }
          }
        );
      }
      
      return { previousUserBookings, previousLabBookings };
    },
    
    onError: (err, variables, context) => {
      devLog.error('Error creating booking, rolling back:', err);
      
      // Rollback optimistic updates
      if (context?.previousUserBookings && variables.userAddress) {
        queryClient.setQueryData(
          QUERY_KEYS.BOOKINGS.userComposed(variables.userAddress, true),
          context.previousUserBookings
        );
      }
      
      if (context?.previousLabBookings) {
        queryClient.setQueryData(
          QUERY_KEYS.BOOKINGS.labComposed(variables.labId),
          context.previousLabBookings
        );
      }
    },
    
    onSuccess: (data, variables) => {
      devLog.log('Booking created successfully:', data);
      
      // Invalidate composed queries to refetch fresh data
      if (variables.userAddress) {
        queryClient.invalidateQueries({ 
          queryKey: QUERY_KEYS.BOOKINGS.userComposed(variables.userAddress, true) 
        });
      }
      
      queryClient.invalidateQueries({ 
        queryKey: QUERY_KEYS.BOOKINGS.labComposed(variables.labId) 
      });

      // Also invalidate atomic queries if they exist
      if (variables.userAddress) {
        queryClient.invalidateQueries({ 
          queryKey: QUERY_KEYS.BOOKINGS.userAtomic(variables.userAddress) 
        });
      }
      queryClient.invalidateQueries({ 
        queryKey: QUERY_KEYS.BOOKINGS.labAtomic(variables.labId) 
      });
    },
  });
};

/**
 * Hook to cancel a booking with optimistic updates
 * @returns {Object} React Query mutation object for canceling bookings
 */
export const useCancelBookingMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (reservationKey) => bookingServices.cancelBooking(reservationKey),
    
    onMutate: async ({ reservationKey, userAddress, labId }) => {
      devLog.log(`Cancelling booking ${reservationKey} optimistically...`);
      
      // Cancel outgoing queries
      if (userAddress) {
        await queryClient.cancelQueries({ 
          queryKey: QUERY_KEYS.BOOKINGS.userComposed(userAddress, true) 
        });
      }
      if (labId) {
        await queryClient.cancelQueries({ 
          queryKey: QUERY_KEYS.BOOKINGS.labComposed(labId) 
        });
      }
      
      // Snapshot and update user bookings
      const previousUserBookings = userAddress ? 
        queryClient.getQueryData(QUERY_KEYS.BOOKINGS.userComposed(userAddress, true)) : null;
      if (previousUserBookings && userAddress) {
        const filteredBookings = (previousUserBookings.bookings || []).filter(
          booking => booking.reservationKey !== reservationKey && booking.id !== reservationKey
        );
        queryClient.setQueryData(
          QUERY_KEYS.BOOKINGS.userComposed(userAddress, true),
          {
            ...previousUserBookings,
            bookings: filteredBookings,
            totalBookings: filteredBookings.length,
            activeBookings: filteredBookings.filter(b => b.status === '1').length
          }
        );
      }
      
      // Snapshot and update lab bookings
      const previousLabBookings = labId ? 
        queryClient.getQueryData(QUERY_KEYS.BOOKINGS.labComposed(labId)) : null;
      if (previousLabBookings) {
        const filteredBookings = (previousLabBookings.bookings || []).filter(
          booking => booking.reservationKey !== reservationKey && booking.id !== reservationKey
        );
        queryClient.setQueryData(
          QUERY_KEYS.BOOKINGS.labComposed(labId),
          {
            ...previousLabBookings,
            bookings: filteredBookings,
            totalBookings: filteredBookings.length,
            metrics: {
              ...previousLabBookings.metrics,
              activeBookings: filteredBookings.filter(b => b.status === '1').length
            }
          }
        );
      }
      
      return { previousUserBookings, previousLabBookings };
    },
    
    onError: (err, variables, context) => {
      devLog.error('Error cancelling booking, rolling back:', err);
      
      // Rollback optimistic updates
      if (context?.previousUserBookings && variables.userAddress) {
        queryClient.setQueryData(
          QUERY_KEYS.BOOKINGS.userComposed(variables.userAddress, true),
          context.previousUserBookings
        );
      }
      
      if (context?.previousLabBookings && variables.labId) {
        queryClient.setQueryData(
          QUERY_KEYS.BOOKINGS.labComposed(variables.labId),
          context.previousLabBookings
        );
      }
    },
    
    onSuccess: (data, variables) => {
      devLog.log('Booking cancelled successfully:', data);
      
      // Invalidate composed queries to refetch fresh data
      if (variables.userAddress) {
        queryClient.invalidateQueries({ 
          queryKey: QUERY_KEYS.BOOKINGS.userComposed(variables.userAddress, true) 
        });
      }
      
      if (variables.labId) {
        queryClient.invalidateQueries({ 
          queryKey: QUERY_KEYS.BOOKINGS.labComposed(variables.labId) 
        });
      }

      // Also invalidate atomic queries if they exist
      if (variables.userAddress) {
        queryClient.invalidateQueries({ 
          queryKey: QUERY_KEYS.BOOKINGS.userAtomic(variables.userAddress) 
        });
      }
      if (variables.labId) {
        queryClient.invalidateQueries({ 
          queryKey: QUERY_KEYS.BOOKINGS.labAtomic(variables.labId) 
        });
      }
    },
  });
};
