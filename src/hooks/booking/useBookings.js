/**
 * React Query Hooks for Booking-related data
 * Uses simple hooks with composed services and cache-extracting hooks
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useCallback, useEffect } from 'react'
import { useWalletClient } from 'wagmi'
import { bookingServices } from '@/services/booking/bookingServices'
import { QUERY_KEYS } from '@/utils/hooks/queryKeys'
import { useLabToken } from '@/hooks/useLabToken'
import useContractWriteFunction from '@/hooks/contract/useContractWriteFunction'
import { useUser } from '@/context/UserContext'
import { createSSRSafeQuery } from '@/utils/ssrSafe'
import devLog from '@/utils/dev/logger'

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
    queryFn: createSSRSafeQuery(
      () => bookingServices.fetchUserBookingsComposed(userAddress, true),
      { bookings: [], totalBookings: 0, activeBookings: 0, pastBookings: 0 } // Return empty booking structure during SSR
    ),
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
    queryFn: createSSRSafeQuery(
      () => bookingServices.fetchLabBookingsComposed(labId, includeMetrics),
      { bookings: [], metrics: null } // Return empty booking structure during SSR
    ),
    enabled: !!labId,
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



// ===============================
// === CACHE-EXTRACTING HOOKS (simple data operations) ===
// ===============================





// ===============================
// === MUTATIONS ===
// ===============================

/**
 * Hook to create a booking with optimistic updates (using authentication-aware routing)
 * @returns {Object} React Query mutation object for creating bookings
 */
export const useCreateBookingMutation = () => {
  const queryClient = useQueryClient();
  const { data: walletClient } = useWalletClient();
  const { address: userAddress, isSSO } = useUser();
  const { contractWriteFunction: reservationRequest } = useContractWriteFunction('reservationRequest');

  return useMutation({
    mutationFn: async (bookingData) => {
      // Create authentication context
      const authContext = {
        isSSO,
        contractWriteFunction: reservationRequest,
        userAddress
      };

      // Use unified service with authentication-aware routing
      return await bookingServices.createBooking(bookingData, authContext);
    },
    
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
 * Hook to cancel a booking with optimistic updates (using client-side transactions)
 * @returns {Object} React Query mutation object for canceling bookings
 */
export const useCancelBookingMutation = () => {
  const queryClient = useQueryClient();
  const { data: walletClient } = useWalletClient();
  const { address: userAddress, isSSO } = useUser();
  const { contractWriteFunction: cancelReservationRequestFn } = useContractWriteFunction('cancelReservationRequest');
  const { contractWriteFunction: cancelBookingFn } = useContractWriteFunction('cancelBooking');

  return useMutation({
    mutationFn: async ({ reservationKey }) => {
      // Create authentication context
      const authContext = {
        isSSO,
        cancelReservationRequestFn,
        cancelBookingFn,
        userAddress
      };

      // Use unified service with authentication-aware routing
      return await bookingServices.cancelBooking(reservationKey, authContext);
    },
    
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

// ===============================
// === GRANULAR CACHE UPDATES FOR BOOKINGS ===
// ===============================

/**
 * Hook for booking-specific granular cache updates
 * @returns {Object} Booking cache update functions
 */
export const useBookingCacheUpdates = () => {
  const queryClient = useQueryClient();

  /**
   * Add a booking to user cache without invalidating everything
   * @param {string} userAddress - User address
   * @param {Object} newBooking - New booking to add
   */
  const addBookingToUserCache = (userAddress, newBooking) => {
    if (!userAddress || !newBooking) return;

    const userBookingsKey = QUERY_KEYS.BOOKINGS.userComposed(userAddress, true);
    const currentData = queryClient.getQueryData(userBookingsKey);
    
    if (currentData) {
      queryClient.setQueryData(userBookingsKey, {
        ...currentData,
        bookings: [...(currentData.bookings || []), newBooking],
        totalBookings: (currentData.totalBookings || 0) + 1
      });
      devLog.log('🎯 Added booking to user cache:', { userAddress, bookingId: newBooking.id });
    }
  };

  /**
   * Remove a booking from user cache without invalidating everything
   * @param {string} userAddress - User address
   * @param {string} bookingId - Booking ID to remove
   */
  const removeBookingFromUserCache = (userAddress, bookingId) => {
    if (!userAddress || !bookingId) return;

    const userBookingsKey = QUERY_KEYS.BOOKINGS.userComposed(userAddress, true);
    const currentData = queryClient.getQueryData(userBookingsKey);
    
    if (currentData) {
      const updatedBookings = (currentData.bookings || []).filter(b => b.id !== bookingId);
      queryClient.setQueryData(userBookingsKey, {
        ...currentData,
        bookings: updatedBookings,
        totalBookings: Math.max(0, (currentData.totalBookings || 0) - 1)
      });
      devLog.log('🎯 Removed booking from user cache:', { userAddress, bookingId });
    }
  };

  /**
   * Update a specific booking in user cache
   * @param {string} userAddress - User address
   * @param {string} bookingId - Booking ID to update
   * @param {Object} updates - Partial booking updates
   */
  const updateBookingInUserCache = (userAddress, bookingId, updates) => {
    if (!userAddress || !bookingId || !updates) return;

    const userBookingsKey = QUERY_KEYS.BOOKINGS.userComposed(userAddress, true);
    const currentData = queryClient.getQueryData(userBookingsKey);
    
    if (currentData) {
      const updatedBookings = (currentData.bookings || []).map(booking => 
        booking.id === bookingId ? { ...booking, ...updates } : booking
      );
      queryClient.setQueryData(userBookingsKey, {
        ...currentData,
        bookings: updatedBookings
      });
      devLog.log('🎯 Updated booking in user cache:', { userAddress, bookingId, updates });
    }
  };

  /**
   * Add a booking to lab cache without invalidating everything  
   * @param {string|number} labId - Lab ID
   * @param {Object} newBooking - New booking to add
   */
  const addBookingToLabCache = (labId, newBooking) => {
    if (!labId || !newBooking) return;

    const labBookingsKey = QUERY_KEYS.BOOKINGS.labComposed(labId, true);
    const currentData = queryClient.getQueryData(labBookingsKey);
    
    if (currentData) {
      queryClient.setQueryData(labBookingsKey, {
        ...currentData,
        bookings: [...(currentData.bookings || []), newBooking],
        totalBookings: (currentData.totalBookings || 0) + 1
      });
      devLog.log('🎯 Added booking to lab cache:', { labId, bookingId: newBooking.id });
    }
  };

  /**
   * Remove a booking from lab cache without invalidating everything
   * @param {string|number} labId - Lab ID  
   * @param {string} bookingId - Booking ID to remove
   */
  const removeBookingFromLabCache = (labId, bookingId) => {
    if (!labId || !bookingId) return;

    const labBookingsKey = QUERY_KEYS.BOOKINGS.labComposed(labId, true);
    const currentData = queryClient.getQueryData(labBookingsKey);
    
    if (currentData) {
      const updatedBookings = (currentData.bookings || []).filter(b => b.id !== bookingId);
      queryClient.setQueryData(labBookingsKey, {
        ...currentData,
        bookings: updatedBookings,
        totalBookings: Math.max(0, (currentData.totalBookings || 0) - 1)
      });
      devLog.log('🎯 Removed booking from lab cache:', { labId, bookingId });
    }
  };

  /**
   * Smart booking invalidation - tries granular first, falls back to invalidation
   * @param {string} userAddress - User address  
   * @param {string|number} labId - Lab ID
   * @param {Object} [bookingData] - Booking data for granular updates
   * @param {string} [action] - Action type: 'add', 'remove', 'update'
   */
  const smartBookingInvalidation = (userAddress, labId, bookingData = null, action = null) => {
    // Special handling for reservationKey-only events (when labId and userAddress are null)
    if (!userAddress && !labId && bookingData?.id && (action === 'remove' || action === 'update')) {
      devLog.log('🔍 Attempting to find reservation in cache by reservationKey:', bookingData.id);
      
      // Try to find the reservation in existing cache to get missing labId/userAddress
      const allQueries = queryClient.getQueryCache().getAll();
      let found = false;
      
      for (const query of allQueries) {
        if (query.queryKey?.[0] === 'bookings' && query.state.data) {
          const data = query.state.data;
          // Check if this is user bookings data
          if (data.bookings && Array.isArray(data.bookings)) {
            const booking = data.bookings.find(b => b.id === bookingData.id || b.reservationKey === bookingData.id);
            if (booking) {
              devLog.log('✅ Found reservation in user cache:', { booking, queryKey: query.queryKey });
              try {
                if (action === 'remove') {
                  removeBookingFromUserCache(query.queryKey[1], bookingData.id);
                } else if (action === 'update') {
                  updateBookingInUserCache(query.queryKey[1], bookingData.id, { ...booking, ...bookingData });
                }
                found = true;
              } catch (error) {
                devLog.warn('Error updating user cache:', error);
              }
            }
          }
          // Check if this is lab bookings data
          if (data.labBookings && Array.isArray(data.labBookings)) {
            const booking = data.labBookings.find(b => b.id === bookingData.id || b.reservationKey === bookingData.id);
            if (booking) {
              devLog.log('✅ Found reservation in lab cache:', { booking, queryKey: query.queryKey });
              try {
                if (action === 'remove') {
                  removeBookingFromLabCache(query.queryKey[1], bookingData.id);
                } else if (action === 'update') {
                  // For lab cache updates, we only update status
                  const labBookings = data.labBookings.map(b => 
                    (b.id === bookingData.id || b.reservationKey === bookingData.id) 
                      ? { ...b, ...bookingData } 
                      : b
                  );
                  queryClient.setQueryData(query.queryKey, { ...data, labBookings });
                }
                found = true;
              } catch (error) {
                devLog.warn('Error updating lab cache:', error);
              }
            }
          }
        }
      }
      
      if (found) {
        devLog.log('✅ Successfully updated cache using reservationKey lookup');
        return;
      } else {
        devLog.warn('⚠️ Could not find reservation in cache, falling back to full invalidation');
      }
    }

    // Try granular updates first if we have the data and action
    if (bookingData && action && (userAddress || labId)) {
      try {
        switch (action) {
          case 'add':
            if (userAddress) addBookingToUserCache(userAddress, bookingData);
            if (labId) addBookingToLabCache(labId, bookingData);
            return; // Success, no need for invalidation
          case 'remove':
            if (userAddress) removeBookingFromUserCache(userAddress, bookingData.id);
            if (labId) removeBookingFromLabCache(labId, bookingData.id);
            return; // Success, no need for invalidation
          case 'update':
            if (userAddress) updateBookingInUserCache(userAddress, bookingData.id, bookingData);
            return; // Success, no need for invalidation
        }
      } catch (error) {
        devLog.warn('⚠️ Granular booking update failed, falling back to invalidation:', error);
      }
    }

    // Fallback to traditional invalidation
    if (userAddress) {
      queryClient.invalidateQueries({ 
        queryKey: QUERY_KEYS.BOOKINGS.userComposed(userAddress, true)
      });
    }
    if (labId) {
      queryClient.invalidateQueries({ 
        queryKey: QUERY_KEYS.BOOKINGS.labComposed(labId, true)
      });
    }
    
    // If no specific user or lab, invalidate all booking queries
    if (!userAddress && !labId) {
      devLog.log('🔄 Invalidating all booking queries (no specific user/lab)');
      queryClient.invalidateQueries({ 
        queryKey: ['bookings']
      });
    }
    
    devLog.log('🔄 Used fallback invalidation for booking data');
  };

  return {
    addBookingToUserCache,
    removeBookingFromUserCache,
    updateBookingInUserCache,
    addBookingToLabCache,
    removeBookingFromLabCache,
    smartBookingInvalidation
  };
};

// ===============================
// === SIMPLE BOOKING CREATION ===
// ===============================

/**
 * Simple booking creation hook following the atomic pattern
 * @param {Object} selectedLab - The lab for which bookings are being created
 * @param {Function} onBookingSuccess - Callback for successful booking completion
 * @returns {Object} Simple booking creation state and handlers
 */
export const useSimpleBookingCreation = (selectedLab, onBookingSuccess) => {
  const [isBooking, setIsBooking] = useState(false)
  const createBookingMutation = useCreateBookingMutation()
  const { formatTokenAmount: formatBalance } = useLabToken()

  /**
   * Calculate booking cost using lab token utilities
   * @param {Date} date - Selected date
   * @param {number} timeMinutes - Duration in minutes
   * @returns {bigint} Cost in wei
   */
  const calculateBookingCost = useCallback((date, timeMinutes) => {
    if (!selectedLab || !date || !timeMinutes) return 0n
    
    // Convert lab price (string) to bigint and calculate
    const pricePerMinute = BigInt(selectedLab.price || '0')
    return pricePerMinute * BigInt(timeMinutes)
  }, [selectedLab])

  /**
   * Format price for display
   * @param {bigint} amount - Amount in wei
   * @returns {string} Formatted price
   */
  const formatPrice = useCallback((amount) => {
    return formatBalance(amount)
  }, [formatBalance])

  /**
   * Create a booking using the mutation
   * @param {Object} bookingParams - Booking parameters
   * @returns {Promise<boolean>} Success status
   */
  const createBooking = useCallback(async (bookingParams) => {
    if (isBooking) return false
    
    setIsBooking(true)
    
    try {
      const result = await createBookingMutation.mutateAsync(bookingParams)
      
      if (onBookingSuccess) {
        onBookingSuccess(result)
      }
      
      return true
    } catch (error) {
      devLog.error('❌ Booking creation failed:', error)
      return false
    } finally {
      setIsBooking(false)
    }
  }, [isBooking, createBookingMutation, onBookingSuccess])

  return {
    // State
    isBooking: isBooking || createBookingMutation.isPending,
    isWaitingForReceipt: false, // Not needed in simplified version
    
    // Actions
    createBooking,
    calculateBookingCost,
    
    // Utilities
    formatBalance,
    formatPrice
  }
}

// Temporary alias for backwards compatibility
export const useCompleteBookingCreation = useSimpleBookingCreation;

// ===============================
// === CLAIM MUTATIONS ===
// ===============================

/**
 * Hook to claim all available balance (using authentication-aware routing)
 * @returns {Object} React Query mutation object for claiming all balance
 */
export const useClaimAllBalanceMutation = () => {
  const { address: userAddress, isSSO } = useUser();
  const { contractWriteFunction: claimAllBalanceFn } = useContractWriteFunction('claimAllBalance');

  return useMutation({
    mutationFn: async () => {
      // Create authentication context
      const authContext = {
        isSSO,
        contractWriteFunction: claimAllBalanceFn,
        userAddress
      };

      // Use unified service with authentication-aware routing
      return await bookingServices.claimAllBalance(authContext);
    },
    
    onSuccess: (data) => {
      devLog.log('All balance claimed successfully:', data);
    },
    
    onError: (error) => {
      devLog.error('Error claiming all balance:', error);
    }
  });
};

/**
 * Hook to claim balance for specific lab (using authentication-aware routing)
 * @returns {Object} React Query mutation object for claiming lab balance
 */
export const useClaimLabBalanceMutation = () => {
  const { address: userAddress, isSSO } = useUser();
  const { contractWriteFunction: claimLabBalanceFn } = useContractWriteFunction('claimLabBalance');

  return useMutation({
    mutationFn: async (labId) => {
      // Create authentication context
      const authContext = {
        isSSO,
        contractWriteFunction: claimLabBalanceFn,
        userAddress
      };

      // Use unified service with authentication-aware routing
      return await bookingServices.claimLabBalance(labId, authContext);
    },
    
    onSuccess: (data, labId) => {
      devLog.log('Lab balance claimed successfully for lab:', labId, data);
    },
    
    onError: (error) => {
      devLog.error('Error claiming lab balance:', error);
    }
  });
};


