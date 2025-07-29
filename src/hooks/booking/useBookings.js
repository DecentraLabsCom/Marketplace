/**
 * React Query Hooks for Bookings
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
 * @param {string} userAddress - User's wallet address or identifier
 * @param {Date|string|null} [fromDate=null] - Start date filter for bookings
 * @param {Date|string|null} [toDate=null] - End date filter for bookings
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with user bookings composed data
 */
export const useUserBookingsQuery = (userAddress, fromDate = null, toDate = null, options = {}) => {
  return useQuery({
    queryKey: ['bookings', 'user-composed', userAddress, fromDate, toDate],
    queryFn: () => bookingServices.fetchUserBookingsComposed(userAddress, fromDate, toDate),
    enabled: !!userAddress,
    staleTime: 5 * 60 * 1000, // 5 minutes
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
 * @param {Date|string|null} [fromDate=null] - Start date filter for bookings
 * @param {Date|string|null} [toDate=null] - End date filter for bookings
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with lab bookings composed data
 */
export const useLabBookingsQuery = (labId, fromDate = null, toDate = null, options = {}) => {
  return useQuery({
    queryKey: ['bookings', 'lab-composed', labId, fromDate, toDate],
    queryFn: () => bookingServices.fetchLabBookingsComposed(labId, fromDate, toDate),
    enabled: !!labId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    refetchInterval: false,
    retry: 2,
    ...options,
  });
};

// === CACHE-EXTRACTING HOOKS (simple data operations) ===

/**
 * Hook to get user bookings list (extracts from composed data)
 * @param {string} userAddress - User's wallet address
 * @param {Date|string|null} [fromDate=null] - Start date filter
 * @param {Date|string|null} [toDate=null] - End date filter
 * @returns {Object} Bookings list with loading and error states
 */
export const useUserBookingsListQuery = (userAddress, fromDate = null, toDate = null) => {
  const userBookingsQuery = useUserBookingsQuery(userAddress, fromDate, toDate);
  
  return useMemo(() => ({
    data: userBookingsQuery.data?.bookings || [],
    isLoading: userBookingsQuery.isLoading,
    error: userBookingsQuery.error,
    refetch: userBookingsQuery.refetch,
  }), [userBookingsQuery.data, userBookingsQuery.isLoading, userBookingsQuery.error]);
};

/**
 * Hook to get lab bookings list (extracts from composed data)
 * @param {string|number} labId - Lab identifier
 * @param {Date|string|null} [fromDate=null] - Start date filter
 * @param {Date|string|null} [toDate=null] - End date filter
 * @returns {Object} Bookings list with loading and error states
 */
export const useLabBookingsListQuery = (labId, fromDate = null, toDate = null) => {
  const labBookingsQuery = useLabBookingsQuery(labId, fromDate, toDate);
  
  return useMemo(() => ({
    data: labBookingsQuery.data?.bookings || [],
    isLoading: labBookingsQuery.isLoading,
    error: labBookingsQuery.error,
    refetch: labBookingsQuery.refetch,
  }), [labBookingsQuery.data, labBookingsQuery.isLoading, labBookingsQuery.error]);
};

// === MUTATIONS ===

/**
 * Hook to create a booking
 * @returns {Object} React Query mutation object for creating bookings with optimistic updates
 */
export const useCreateBookingMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ labId, startTime, endTime, config }) => 
      bookingServices.createBooking(labId, startTime, endTime, config),
    
    onMutate: async ({ labId, startTime, endTime, userAddress }) => {
      devLog.log('Creating booking optimistically...');
      
      // Cancel outgoing queries to avoid overwriting optimistic update
      await queryClient.cancelQueries({ 
        queryKey: ['bookings', 'user-composed', userAddress] 
      });
      await queryClient.cancelQueries({ 
        queryKey: ['bookings', 'lab-composed', labId] 
      });
      
      // Create optimistic booking
      const optimisticBooking = {
        id: `temp_${Date.now()}`,
        labId,
        userAddress,
        startTime,
        endTime,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      
      // Snapshot and update user bookings
      const previousUserBookings = queryClient.getQueryData(['bookings', 'user-composed', userAddress]);
      if (previousUserBookings && userAddress) {
        queryClient.setQueryData(
          ['bookings', 'user-composed', userAddress],
          {
            ...previousUserBookings,
            bookings: [...(previousUserBookings.bookings || []), optimisticBooking]
          }
        );
      }
      
      // Snapshot and update lab bookings
      const previousLabBookings = queryClient.getQueryData(['bookings', 'lab-composed', labId]);
      if (previousLabBookings) {
        queryClient.setQueryData(
          ['bookings', 'lab-composed', labId],
          {
            ...previousLabBookings,
            bookings: [...(previousLabBookings.bookings || []), optimisticBooking]
          }
        );
      }
      
      return { previousUserBookings, previousLabBookings };
    },
    
    onError: (err, variables, context) => {
      devLog.error('Error creating booking, rolling back:', err);
      
      // Rollback optimistic updates
      if (context?.previousUserBookings) {
        queryClient.setQueryData(
          ['bookings', 'user-composed', variables.userAddress],
          context.previousUserBookings
        );
      }
      
      if (context?.previousLabBookings) {
        queryClient.setQueryData(
          ['bookings', 'lab-composed', variables.labId],
          context.previousLabBookings
        );
      }
    },
    
    onSuccess: (data, variables) => {
      devLog.log('Booking created successfully:', data);
      
      // Invalidate composed queries to refetch fresh data
      if (variables.userAddress) {
        queryClient.invalidateQueries({ 
          queryKey: ['bookings', 'user-composed', variables.userAddress] 
        });
      }
      
      queryClient.invalidateQueries({ 
        queryKey: ['bookings', 'lab-composed', variables.labId] 
      });
    },
  });
};

/**
 * Hook to cancel a booking
 * @returns {Object} React Query mutation object for canceling bookings with optimistic updates
 */
export const useCancelBookingMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ bookingId }) => bookingServices.cancelBooking(bookingId),
    
    onMutate: async ({ bookingId, userAddress, labId }) => {
      devLog.log(`Cancelling booking ${bookingId} optimistically...`);
      
      // Cancel outgoing queries
      await queryClient.cancelQueries({ 
        queryKey: ['bookings', 'user-composed', userAddress] 
      });
      await queryClient.cancelQueries({ 
        queryKey: ['bookings', 'lab-composed', labId] 
      });
      
      // Snapshot and update user bookings
      const previousUserBookings = queryClient.getQueryData(['bookings', 'user-composed', userAddress]);
      if (previousUserBookings && userAddress) {
        queryClient.setQueryData(
          ['bookings', 'user-composed', userAddress],
          {
            ...previousUserBookings,
            bookings: (previousUserBookings.bookings || []).filter(booking => booking.id !== bookingId)
          }
        );
      }
      
      // Snapshot and update lab bookings
      const previousLabBookings = queryClient.getQueryData(['bookings', 'lab-composed', labId]);
      if (previousLabBookings) {
        queryClient.setQueryData(
          ['bookings', 'lab-composed', labId],
          {
            ...previousLabBookings,
            bookings: (previousLabBookings.bookings || []).filter(booking => booking.id !== bookingId)
          }
        );
      }
      
      return { previousUserBookings, previousLabBookings };
    },
    
    onError: (err, variables, context) => {
      devLog.error('Error cancelling booking, rolling back:', err);
      
      // Rollback optimistic updates
      if (context?.previousUserBookings) {
        queryClient.setQueryData(
          ['bookings', 'user-composed', variables.userAddress],
          context.previousUserBookings
        );
      }
      
      if (context?.previousLabBookings) {
        queryClient.setQueryData(
          ['bookings', 'lab-composed', variables.labId],
          context.previousLabBookings
        );
      }
    },
    
    onSuccess: (data, variables) => {
      devLog.log('Booking cancelled successfully:', data);
      
      // Invalidate composed queries to refetch fresh data
      if (variables.userAddress) {
        queryClient.invalidateQueries({ 
          queryKey: ['bookings', 'user-composed', variables.userAddress] 
        });
      }
      
      if (variables.labId) {
        queryClient.invalidateQueries({ 
          queryKey: ['bookings', 'lab-composed', variables.labId] 
        });
      }
    },
  });
};
