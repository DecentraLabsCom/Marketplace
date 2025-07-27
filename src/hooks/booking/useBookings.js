/**
 * React Query Hooks for Bookings
 * Replaces gradually the logic of BookingContext
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bookingServices } from '@/services/bookingServices';
import { QUERY_KEYS, INVALIDATION_PATTERNS } from '@/utils/queryKeys';
import devLog from '@/utils/dev/logger';

// === QUERIES ===

/**
 * Hook to get user bookings
 */
export const useUserBookingsQuery = (userAddress, fromDate = null, toDate = null, options = {}) => {
  return useQuery({
    queryKey: QUERY_KEYS.BOOKINGS.user(userAddress),
    queryFn: () => bookingServices.fetchUserBookings(userAddress, fromDate, toDate),
    enabled: !!userAddress,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 12 * 60 * 60 * 1000, // 12 hours
    retry: 2,
    ...options,
  });
};

/**
 * Hook to get bookings for a specific lab
 */
export const useLabBookingsQuery = (labId, fromDate = null, toDate = null, options = {}) => {
  const queryKey = fromDate && toDate 
    ? QUERY_KEYS.BOOKINGS.labWithDates(labId, fromDate, toDate)
    : QUERY_KEYS.BOOKINGS.lab(labId);

  return useQuery({
    queryKey,
    queryFn: () => bookingServices.fetchLabBookings(labId, fromDate, toDate),
    enabled: !!labId,
    staleTime: 5 * 60 * 1000, // 5 minutos
    gcTime: 12 * 60 * 60 * 1000, // 12 horas
    retry: 2,
    ...options,
  });
};

// === MUTATIONS ===

/**
 * Hook to create a booking
 */
export const useCreateBookingMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ labId, startTime, endTime, config }) => 
      bookingServices.createBooking(labId, startTime, endTime, config),
    
    onMutate: async ({ labId, startTime, endTime, userAddress }) => {
      // Optimistic update
      devLog.log('Creating booking optimistically...');
      
      // Cancel outgoing queries to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.BOOKINGS.all });
      
      // Snapshot previous values
      const previousUserBookings = queryClient.getQueryData(QUERY_KEYS.BOOKINGS.user(userAddress));
      const previousLabBookings = queryClient.getQueryData(QUERY_KEYS.BOOKINGS.lab(labId));
      
      // Optimistically update user bookings
      if (previousUserBookings && userAddress) {
        const optimisticBooking = {
          id: `temp_${Date.now()}`,
          labId,
          userAddress,
          startTime,
          endTime,
          status: 'pending',
          createdAt: new Date().toISOString(),
        };
        
        queryClient.setQueryData(
          QUERY_KEYS.BOOKINGS.user(userAddress),
          [...previousUserBookings, optimisticBooking]
        );
      }
      
      // Optimistically update lab bookings
      if (previousLabBookings) {
        const optimisticBooking = {
          id: `temp_${Date.now()}`,
          labId,
          userAddress,
          startTime,
          endTime,
          status: 'pending',
          createdAt: new Date().toISOString(),
        };
        
        queryClient.setQueryData(
          QUERY_KEYS.BOOKINGS.lab(labId),
          [...previousLabBookings, optimisticBooking]
        );
      }
      
      return { previousUserBookings, previousLabBookings };
    },
    
    onError: (err, variables, context) => {
      devLog.error('Error creating booking, rolling back:', err);
      
      // Rollback optimistic updates
      if (context?.previousUserBookings) {
        queryClient.setQueryData(
          QUERY_KEYS.BOOKINGS.user(variables.userAddress),
          context.previousUserBookings
        );
      }
      
      if (context?.previousLabBookings) {
        queryClient.setQueryData(
          QUERY_KEYS.BOOKINGS.lab(variables.labId),
          context.previousLabBookings
        );
      }
    },
    
    onSuccess: (data, variables) => {
      devLog.log('Booking created successfully:', data);
      
      // Invalidate and refetch related queries
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.BOOKINGS.all });
      
      if (variables.userAddress) {
        queryClient.invalidateQueries({ 
          queryKey: QUERY_KEYS.BOOKINGS.user(variables.userAddress) 
        });
      }
      
      queryClient.invalidateQueries({ 
        queryKey: QUERY_KEYS.BOOKINGS.lab(variables.labId) 
      });
    },
  });
};

/**
 * Hook to cancel a booking
 */
export const useCancelBookingMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ bookingId }) => bookingServices.cancelBooking(bookingId),
    
    onMutate: async ({ bookingId, userAddress, labId }) => {
      devLog.log(`Cancelling booking ${bookingId} optimistically...`);
      
      // Cancel outgoing queries
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.BOOKINGS.all });
      
      // Snapshot previous values
      const previousUserBookings = queryClient.getQueryData(QUERY_KEYS.BOOKINGS.user(userAddress));
      const previousLabBookings = queryClient.getQueryData(QUERY_KEYS.BOOKINGS.lab(labId));
      
      // Optimistically remove booking from user bookings
      if (previousUserBookings && userAddress) {
        queryClient.setQueryData(
          QUERY_KEYS.BOOKINGS.user(userAddress),
          previousUserBookings.filter(booking => booking.id !== bookingId)
        );
      }
      
      // Optimistically remove booking from lab bookings
      if (previousLabBookings) {
        queryClient.setQueryData(
          QUERY_KEYS.BOOKINGS.lab(labId),
          previousLabBookings.filter(booking => booking.id !== bookingId)
        );
      }
      
      return { previousUserBookings, previousLabBookings };
    },
    
    onError: (err, variables, context) => {
      devLog.error('Error cancelling booking, rolling back:', err);
      
      // Rollback optimistic updates
      if (context?.previousUserBookings) {
        queryClient.setQueryData(
          QUERY_KEYS.BOOKINGS.user(variables.userAddress),
          context.previousUserBookings
        );
      }
      
      if (context?.previousLabBookings) {
        queryClient.setQueryData(
          QUERY_KEYS.BOOKINGS.lab(variables.labId),
          context.previousLabBookings
        );
      }
    },
    
    onSuccess: (data, variables) => {
      devLog.log('Booking cancelled successfully:', data);
      
      // Invalidate and refetch related queries
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.BOOKINGS.all });
      
      if (variables.userAddress) {
        queryClient.invalidateQueries({ 
          queryKey: QUERY_KEYS.BOOKINGS.user(variables.userAddress) 
        });
      }
      
      queryClient.invalidateQueries({ 
        queryKey: QUERY_KEYS.BOOKINGS.lab(variables.labId) 
      });
    },
  });
};

// === UTILITIES ===

/**
 * Hook to invalidate booking cache manually
 */
export const useBookingCacheInvalidation = () => {
  const queryClient = useQueryClient();
  
  return {
    invalidateAllBookings: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.BOOKINGS.all });
    },
    
    invalidateUserBookings: (userAddress) => {
      INVALIDATION_PATTERNS.userBookings(userAddress).forEach(queryKey => {
        queryClient.invalidateQueries({ queryKey });
      });
    },
    
    invalidateLabBookings: (labId) => {
      INVALIDATION_PATTERNS.labBookings(labId).forEach(queryKey => {
        queryClient.invalidateQueries({ queryKey });
      });
    },
    
    // Force refetch without invalidation
    refetchUserBookings: (userAddress) => {
      queryClient.refetchQueries({ queryKey: QUERY_KEYS.BOOKINGS.user(userAddress) });
    },
    
    refetchLabBookings: (labId) => {
      queryClient.refetchQueries({ queryKey: QUERY_KEYS.BOOKINGS.lab(labId) });
    },
  };
};