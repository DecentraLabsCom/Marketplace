/**
 * React Query Hooks for Booking-related data
 * Uses simple hooks with composed services and cache-extracting hooks
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useCallback, useEffect } from 'react'
import { useWaitForTransactionReceipt } from 'wagmi'
import { bookingServices } from '@/services/bookingServices'
import { QUERY_KEYS } from '@/utils/hooks/queryKeys'
import { useLabToken } from '@/hooks/useLabToken'
import useContractWriteFunction from '@/hooks/contract/useContractWriteFunction'
import { useNotifications } from '@/context/NotificationContext'
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
    // Try granular updates first if we have the data and action
    if (bookingData && action) {
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
// === COMPLETE BOOKING CREATION WORKFLOW ===
// ===============================

/**
 * Comprehensive booking creation hook with full wallet workflow
 * Migrated from useBookingCreation.js to maintain consistency with useLabs.js pattern
 * Handles: balance checking, token approval, reservation creation, and transaction monitoring
 * @param {Object} selectedLab - Currently selected lab object
 * @param {Function} onBookingSuccess - Callback for successful booking completion
 * @returns {Object} Complete booking creation state and handlers
 */
export const useCompleteBookingCreation = (selectedLab, onBookingSuccess) => {
  const { addTemporaryNotification, addErrorNotification } = useNotifications()
  const bookingCacheUpdates = useBookingCacheUpdates()

  // Booking state
  const [isBooking, setIsBooking] = useState(false)
  const [lastTxHash, setLastTxHash] = useState(null)
  const [txType, setTxType] = useState(null) // 'reservation', 'approval'
  const [pendingData, setPendingData] = useState(null)

  // Lab token utilities
  const { 
    calculateReservationCost, 
    checkBalanceAndAllowance, 
    approveLabTokens, 
    formatTokenAmount: formatBalance,
    formatPrice,
    refreshTokenData
  } = useLabToken()

  // Contract write function
  const { contractWriteFunction: reservationRequest } = useContractWriteFunction('reservationRequest')

  // Wait for transaction receipt
  const { 
    data: receipt, 
    isLoading: isWaitingForReceipt, 
    isSuccess: isReceiptSuccess,
    isError: isReceiptError,
    error: receiptError
  } = useWaitForTransactionReceipt({
    hash: lastTxHash,
    enabled: !!lastTxHash
  })

  /**
   * Calculate booking cost - delegate to useLabToken
   * @param {Date} date - Selected date
   * @param {number} timeMinutes - Duration in minutes
   * @returns {bigint} Cost in wei
   */
  const calculateBookingCost = useCallback((date, timeMinutes) => {
    if (!selectedLab || !date || !timeMinutes) return 0n
    
    return calculateReservationCost(selectedLab.price, timeMinutes)
  }, [selectedLab, calculateReservationCost])

  /**
   * Check user balance and allowance for a given cost
   * @param {bigint} cost - Cost in wei
   * @returns {Object} Balance and allowance status
   */
  const checkUserBalance = useCallback((cost) => {
    return checkBalanceAndAllowance(cost)
  }, [checkBalanceAndAllowance])

  /**
   * Approve LAB tokens for spending - delegate to useLabToken
   * @param {bigint} amount - Amount to approve in wei
   * @returns {Promise<boolean>} Success status
   */
  const approveTokens = useCallback(async (amount) => {
    if (!amount) return false

    try {
      setIsBooking(true)
      setTxType('approval')
      
      addTemporaryNotification('Requesting token approval...', 'info', 5000)
      
      const txHash = await approveLabTokens(amount)
      setLastTxHash(txHash)
      
      devLog.log('✅ Approval transaction sent:', txHash)
      return true
    } catch (error) {
      devLog.error('❌ Token approval failed:', error)
      addErrorNotification('Token approval failed. Please try again.')
      setIsBooking(false)
      setTxType(null)
      return false
    }
  }, [approveLabTokens, addTemporaryNotification, addErrorNotification])

  /**
   * Create a reservation
   * @param {Object} bookingData - Booking parameters
   * @param {string} bookingData.labId - Lab ID
   * @param {number} bookingData.startTime - Start timestamp
   * @param {number} bookingData.endTime - End timestamp
   * @param {string} bookingData.userAddress - User wallet address
   * @returns {Promise<boolean>} Success status
   */
  const createReservation = useCallback(async (bookingData) => {
    if (!bookingData || !selectedLab) return false

    try {
      setIsBooking(true)
      setTxType('reservation')
      setPendingData(bookingData)
      
      addTemporaryNotification('Creating reservation...', 'info', 5000)
      
      const txHash = await reservationRequest([
        bookingData.labId,
        bookingData.startTime,
        bookingData.endTime
      ])
      
      setLastTxHash(txHash)
      
      devLog.log('✅ Reservation transaction sent:', txHash)
      return true
    } catch (error) {
      devLog.error('❌ Reservation creation failed:', error)
      addErrorNotification('Reservation creation failed. Please try again.')
      setIsBooking(false)
      setTxType(null)
      setPendingData(null)
      return false
    }
  }, [selectedLab, reservationRequest, addTemporaryNotification, addErrorNotification])

  /**
   * Complete booking workflow
   * @param {Object} bookingParams - Complete booking parameters
   * @returns {Promise<boolean>} Success status
   */
  const createBooking = useCallback(async (bookingParams) => {
    const { date, timeMinutes, userAddress, selectedTime } = bookingParams
    
    if (!selectedLab || !date || !timeMinutes || !userAddress) {
      addErrorNotification('Missing required booking information.')
      return false
    }

    try {
      // Calculate cost
      const cost = calculateBookingCost(date, timeMinutes)
      if (!cost || cost === 0n) {
        addErrorNotification('Unable to calculate booking cost.')
        return false
      }

      // Check balance and allowance using useLabToken function directly
      const { hasSufficientBalance, hasSufficientAllowance } = checkBalanceAndAllowance(cost)
      
      if (!hasSufficientBalance) {
        addErrorNotification(`Insufficient LAB token balance. Required: ${formatBalance(cost)} LAB`)
        return false
      }

      // Approve tokens if needed
      if (!hasSufficientAllowance) {
        const approvalSuccess = await approveTokens(cost)
        if (!approvalSuccess) return false
        // Transaction will be handled by receipt watcher
        return true
      }

      // Create reservation directly if already approved
      const startTime = Math.floor(new Date(`${date.toDateString()} ${selectedTime}`).getTime() / 1000)
      const endTime = startTime + (timeMinutes * 60)

      const bookingData = {
        labId: selectedLab.id,
        startTime,
        endTime,
        userAddress
      }

      return await createReservation(bookingData)
    } catch (error) {
      devLog.error('❌ Booking creation workflow failed:', error)
      addErrorNotification('Booking creation failed. Please try again.')
      return false
    }
    }, [selectedLab, calculateBookingCost, checkBalanceAndAllowance, approveTokens, createReservation, addErrorNotification])  /**
   * Reset booking state
   */
  const resetBookingState = useCallback(() => {
    setIsBooking(false)
    setLastTxHash(null)
    setTxType(null)
    setPendingData(null)
  }, [])

  // Handle transaction completion
  useEffect(() => {
    if (isReceiptSuccess && receipt && txType) {
      devLog.log('✅ Transaction completed:', { txType, receipt })
      
      if (txType === 'approval' && pendingData) {
        // After approval, create the reservation
        const { labId, startTime, endTime, userAddress } = pendingData
        createReservation({ labId, startTime, endTime, userAddress })
      } else if (txType === 'reservation') {
        // Booking completed successfully
        addTemporaryNotification('Reservation created successfully!', 'success', 5000)
        
        // Use granular cache updates for booking creation
        try {
          const newBookingData = {
            id: receipt?.logs?.[0]?.topics?.[1], // Assuming booking ID from receipt
            labId: selectedLab?.id,
            startTime: pendingData?.startTime,
            endTime: pendingData?.endTime,
            userAddress: pendingData?.userAddress,
            status: 'active',
            timestamp: new Date().toISOString()
          };
          
          // Add to user's bookings
          bookingCacheUpdates.addBookingToUserCache(newBookingData, pendingData?.userAddress);
          
          // Add to lab's bookings
          if (selectedLab?.id) {
            bookingCacheUpdates.addBookingToLabCache(newBookingData, selectedLab.id);
          }
        } catch (error) {
          devLog.warn('Granular cache update failed, using smart invalidation:', error);
          bookingCacheUpdates.smartBookingInvalidation(selectedLab?.id);
        }
        
        // Refresh token data
        refreshTokenData()
        
        // Call success callback
        if (onBookingSuccess) {
          onBookingSuccess(receipt)
        }
        
        resetBookingState()
      }
    } else if (isReceiptError && receiptError) {
      devLog.error('❌ Transaction failed:', receiptError)
      addErrorNotification('Transaction failed. Please try again.')
      resetBookingState()
    }
  }, [isReceiptSuccess, isReceiptError, receipt, receiptError, txType, pendingData, createReservation, addTemporaryNotification, addErrorNotification, bookingCacheUpdates, selectedLab, refreshTokenData, onBookingSuccess, resetBookingState])

  return {
    // State
    isBooking,
    isWaitingForReceipt,
    txType,
    lastTxHash,
    
    // Actions
    createBooking,
    calculateBookingCost,
    checkUserBalance,
    resetBookingState,
    
    // Utilities
    formatBalance,
    formatPrice
  }
};
