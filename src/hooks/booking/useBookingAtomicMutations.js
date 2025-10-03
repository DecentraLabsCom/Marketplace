/**
 * Atomic React Query Hooks for Booking-related Write Operations
 * Each hook maps 1:1 to a specific API endpoint in /api/contract/reservation/
 * Handles mutations (create, update, delete operations)
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import useContractWriteFunction from '@/hooks/contract/useContractWriteFunction'
import { useUser } from '@/context/UserContext'
import { bookingQueryKeys } from '@/utils/hooks/queryKeys'
import { useBookingCacheUpdates } from './useBookingCacheUpdates'
import devLog from '@/utils/dev/logger'

// ===== MUTATIONS =====

/**
 * Hook for /api/contract/reservation/reservationRequest endpoint using wallet (non-SSO users)  
 * Creates a new reservation request using user's wallet
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useReservationRequestWallet = (options = {}) => {
  const queryClient = useQueryClient();
  const { addOptimisticBooking, replaceOptimisticBooking, removeOptimisticBooking, invalidateAllBookings } = useBookingCacheUpdates();
  const { contractWriteFunction: reservationRequest } = useContractWriteFunction('reservationRequest');

  return useMutation({
    mutationFn: async (requestData) => {
      // **NEW: Add optimistic booking for immediate UI feedback**
      const optimisticBooking = addOptimisticBooking({
        tokenId: requestData.tokenId,
        labId: requestData.tokenId,
        start: requestData.start,
        end: requestData.end,
        userAddress: requestData.userAddress || 'unknown',
        status: 'requesting'
      });

      try {
        devLog.log('🎯 Optimistic booking added to cache:', optimisticBooking.id);

        const txHash = await reservationRequest([requestData.tokenId, requestData.start, requestData.end]);
        
        devLog.log('🔍 useReservationRequestWallet - Transaction Hash:', txHash);
        return { hash: txHash, optimisticId: optimisticBooking.id };
      } catch (error) {
        // Remove optimistic update on error
        removeOptimisticBooking(optimisticBooking.id);
        throw error;
      }
    },
    onSuccess: (result, variables) => {
      // **NEW: Replace optimistic booking with transaction-pending version**
      try {
        const transactionPendingBooking = {
          ...variables,
          reservationKey: result.optimisticId, // Temporary until we get real key
          tokenId: variables.tokenId,
          labId: variables.tokenId,
          start: variables.start,
          end: variables.end,
          userAddress: variables.userAddress || 'unknown',
          status: 'pending',
          transactionHash: result.hash,
          isPending: true, // Still pending blockchain confirmation
          isProcessing: false, // No longer processing on client side
          timestamp: new Date().toISOString()
        };
        
        replaceOptimisticBooking(result.optimisticId, transactionPendingBooking);
        devLog.log('✅ Reservation request transaction sent via wallet, awaiting blockchain confirmation');
      } catch (error) {
        devLog.error('Failed to update optimistic data, falling back to invalidation:', error);
        invalidateAllBookings();
        if (variables.tokenId) {
          queryClient.invalidateQueries({ queryKey: bookingQueryKeys.getReservationsOfToken(variables.tokenId) });
          queryClient.invalidateQueries({ queryKey: bookingQueryKeys.hasActiveBookingByToken(variables.tokenId) });
        }
      }
    },
    onError: (error) => {
      devLog.error('❌ Failed to create reservation request via wallet:', error);
    },
    ...options,
  });
};

/**
 * Hook for /api/contract/reservation/reservationRequestSSO endpoint using server wallet (SSO users)
 * Creates a new reservation request using server wallet for SSO users
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useReservationRequestSSO = (options = {}) => {
  const queryClient = useQueryClient();
  const { addBooking, invalidateAllBookings } = useBookingCacheUpdates();

  return useMutation({
    mutationFn: async (requestData) => {
      const response = await fetch('/api/contract/reservation/reservationRequestSSO', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      if (!response.ok) {
        throw new Error(`Failed to create SSO reservation request: ${response.status}`);
      }

      const data = await response.json();
      devLog.log('🔍 useReservationRequestSSO:', data);
      return data;
    },
    onSuccess: (data, variables) => {
      // Use cache utilities for granular updates
      try {
        // Create booking data from response and variables
        const newBooking = {
          ...data,
          tokenId: variables.tokenId,
          labId: variables.tokenId,
          start: variables.start,
          end: variables.end,
          userAddress: variables.userAddress || data.userAddress || 'unknown',
          status: data.status || 'confirmed',
          timestamp: new Date().toISOString()
        };
        
        addBooking(newBooking);
        devLog.log('✅ SSO Reservation request created successfully, cache updated granularly');
      } catch (error) {
        devLog.error('Failed granular cache update, falling back to invalidation:', error);
        // Fallback to invalidation
        invalidateAllBookings();
        if (variables.tokenId) {
          queryClient.invalidateQueries({ queryKey: bookingQueryKeys.getReservationsOfToken(variables.tokenId) });
          queryClient.invalidateQueries({ queryKey: bookingQueryKeys.hasActiveBookingByToken(variables.tokenId) });
        }
      }
    },
    onError: (error) => {
      devLog.error('❌ Failed to create SSO reservation request:', error);
    },
    ...options,
  });
};

/**
 * Unified Hook for creating reservation requests (auto-detects SSO vs Wallet)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useReservationRequest = (options = {}) => {
  const { isSSO } = useUser();
  
  // Call both hooks unconditionally to follow rules of hooks
  const ssoMutation = useReservationRequestSSO(options);
  const walletMutation = useReservationRequestWallet(options);
  
  // Return the appropriate mutation
  return isSSO ? ssoMutation : walletMutation;
};

/**
 * Hook for /api/contract/reservation/cancelReservationRequest endpoint using server wallet (SSO users)
 * Cancels a reservation request using server wallet for SSO users
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useCancelReservationRequestSSO = (options = {}) => {
  const queryClient = useQueryClient();
  const { updateBooking, removeBooking, invalidateAllBookings } = useBookingCacheUpdates();

  return useMutation({
    mutationFn: async (reservationKey) => {
      const response = await fetch('/api/contract/reservation/cancelReservationRequest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservationKey })
      });

      if (!response.ok) {
        throw new Error(`Failed to cancel reservation request: ${response.status}`);
      }

      const data = await response.json();
      devLog.log('🔍 useCancelReservationRequestSSO:', data);
      return data;
    },
    onSuccess: (data, reservationKey) => {
      // Use cache utilities for optimistic update
      try {
        // Update booking to mark as cancelled
        const updatedBooking = {
          reservationKey,
          status: '4', // Cancelled status
          isCancelled: true,
          timestamp: new Date().toISOString()
        };
        
        updateBooking(reservationKey, updatedBooking);
        devLog.log('✅ Reservation request marked as cancelled in cache via SSO (granular update)');
      } catch (error) {
        devLog.error('Failed granular cache update, falling back to invalidation:', error);
        // Fallback to invalidation
        queryClient.invalidateQueries({ queryKey: bookingQueryKeys.byReservationKey(reservationKey) });
        invalidateAllBookings();
      }
    },
    onError: (error, reservationKey) => {
      // Revert optimistic update on error
      queryClient.invalidateQueries({ queryKey: bookingQueryKeys.byReservationKey(reservationKey) });
      devLog.error('❌ Failed to cancel reservation request via SSO - reverting optimistic update:', error);
    },
    ...options,
  });
};

/**
 * Hook for wallet-based cancelReservationRequest using useContractWriteFunction
 * Cancels a reservation request using user's wallet
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useCancelReservationRequestWallet = (options = {}) => {
  const queryClient = useQueryClient();
  const { contractWriteFunction: cancelReservationRequest } = useContractWriteFunction('cancelReservationRequest');

  return useMutation({
    mutationFn: async (reservationKey) => {
      const txHash = await cancelReservationRequest([reservationKey]);
      
      devLog.log('🔍 useCancelReservationRequestWallet - Transaction Hash:', txHash);
      return { hash: txHash };
    },
    onSuccess: (result, reservationKey) => {
      // Optimistic update: mark reservation as cancelled in cache to remove from UI immediately
      queryClient.setQueryData(bookingQueryKeys.byReservationKey(reservationKey), (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          reservation: {
            ...oldData.reservation,
            status: '4', // Cancelled status
            isCancelled: true
          }
        };
      });
      devLog.log('✅ Reservation request marked as cancelled in cache via wallet (optimistic update)');
    },
    onError: (error, reservationKey) => {
      // Revert optimistic update on error
      queryClient.invalidateQueries({ queryKey: bookingQueryKeys.byReservationKey(reservationKey) });
      devLog.error('❌ Failed to cancel reservation request via wallet - reverting optimistic update:', error);
    },
    ...options,
  });
};

/**
 * Unified Hook for cancelling reservation requests (auto-detects SSO vs Wallet)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useCancelReservationRequest = (options = {}) => {
  const { isSSO } = useUser();
  
  // Call both hooks unconditionally to follow rules of hooks
  const ssoMutation = useCancelReservationRequestSSO(options);
  const walletMutation = useCancelReservationRequestWallet(options);
  
  // Return the appropriate mutation
  return isSSO ? ssoMutation : walletMutation;
};

/**
 * Hook for /api/contract/reservation/confirmReservationRequest endpoint using server wallet
 * Confirms a reservation request using server wallet
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useConfirmReservationRequest = (options = {}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reservationKey) => {
      const response = await fetch('/api/contract/reservation/confirmReservationRequest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservationKey })
      });

      if (!response.ok) {
        // Try to get the error details from the response
        let errorDetails = 'Unknown error';
        try {
          const errorData = await response.json();
          errorDetails = errorData.details || errorData.error || 'Unknown error';
        } catch (parseError) {
          errorDetails = `Status: ${response.status}`;
        }
        
        devLog.error(`❌ Reservation confirmation failed with status ${response.status}:`, errorDetails);
        throw new Error(`Failed to confirm reservation request: ${response.status} - ${errorDetails}`);
      }

      const data = await response.json();
      
      // Log different types of successful responses
      if (data.note) {
        devLog.log('⚠️ useConfirmReservationRequest - Transaction already processed:', {
          reservationKey,
          transactionHash: data.transactionHash,
          note: data.note
        });
      } else {
        devLog.log('✅ useConfirmReservationRequest - New transaction sent:', data);
      }
      
      return data;
    },
    onSuccess: (data, reservationKey) => {
      // Update reservation status in cache
      queryClient.invalidateQueries({ queryKey: bookingQueryKeys.byReservationKey(reservationKey) });
      queryClient.invalidateQueries({ queryKey: bookingQueryKeys.all() });
      devLog.log('✅ Reservation request confirmed successfully, cache updated');
    },
    onError: (error) => {
      devLog.error('❌ Failed to confirm reservation request:', error);
    },
    ...options,
  });
};

/**
 * Hook for /api/contract/reservation/denyReservationRequest endpoint using server wallet (SSO users)
 * Denies a reservation request using server wallet for SSO users (provider action)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useDenyReservationRequestSSO = (options = {}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reservationKey) => {
      const response = await fetch('/api/contract/reservation/denyReservationRequest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservationKey })
      });

      if (!response.ok) {
        throw new Error(`Failed to deny reservation request: ${response.status}`);
      }

      const data = await response.json();
      devLog.log('🔍 useDenyReservationRequestSSO:', data);
      return data;
    },
    onSuccess: (data, reservationKey) => {
      // Remove denied reservation and invalidate queries
      queryClient.removeQueries(bookingQueryKeys.byReservationKey(reservationKey));
      queryClient.invalidateQueries({ queryKey: bookingQueryKeys.all() });
      devLog.log('✅ Reservation request denied successfully via SSO, cache updated');
    },
    onError: (error) => {
      devLog.error('❌ Failed to deny reservation request via SSO:', error);
    },
    ...options,
  });
};

/**
 * Hook for wallet-based denyReservationRequest using useContractWriteFunction
 * Denies a reservation request using user's wallet (provider action)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useDenyReservationRequestWallet = (options = {}) => {
  const queryClient = useQueryClient();
  const { contractWriteFunction: denyReservationRequest } = useContractWriteFunction('denyReservationRequest');

  return useMutation({
    mutationFn: async (reservationKey) => {
      const txHash = await denyReservationRequest([reservationKey]);
      
      devLog.log('🔍 useDenyReservationRequestWallet - Transaction Hash:', txHash);
      return { hash: txHash };
    },
    onSuccess: (result, reservationKey) => {
      // Remove denied reservation and invalidate queries
      queryClient.removeQueries(bookingQueryKeys.byReservationKey(reservationKey));
      queryClient.invalidateQueries({ queryKey: bookingQueryKeys.all() });
      devLog.log('✅ Reservation request denied successfully via wallet, cache updated');
    },
    onError: (error) => {
      devLog.error('❌ Failed to deny reservation request via wallet:', error);
    },
    ...options,
  });
};

/**
 * Unified Hook for denying reservation requests (auto-detects SSO vs Wallet)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useDenyReservationRequest = (options = {}) => {
  const { isSSO } = useUser();
  
  // Call both hooks unconditionally to follow rules of hooks
  const ssoMutation = useDenyReservationRequestSSO(options);
  const walletMutation = useDenyReservationRequestWallet(options);
  
  // Return the appropriate mutation
  return isSSO ? ssoMutation : walletMutation;
};

/**
 * Hook for /api/contract/reservation/cancelBookingSSO endpoint
 * Cancels an existing booking (SSO users)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useCancelBookingSSO = (options = {}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reservationKey) => {
      const response = await fetch('/api/contract/reservation/cancelBookingSSO', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservationKey })
      });

      if (!response.ok) {
        throw new Error(`Failed to cancel booking: ${response.status}`);
      }

      const data = await response.json();
      devLog.log('🔍 useCancelBookingSSO:', data);
      return data;
    },
    onSuccess: (data, reservationKey) => {
      // Optimistic update: mark booking as cancelled in cache to remove from UI immediately
      queryClient.setQueryData(bookingQueryKeys.byReservationKey(reservationKey), (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          reservation: {
            ...oldData.reservation,
            status: '4', // Cancelled status
            isCancelled: true
          }
        };
      });
      devLog.log('✅ Booking marked as cancelled in cache (optimistic update)');
    },
    onError: (error, reservationKey) => {
      // Revert optimistic update on error
      queryClient.invalidateQueries({ queryKey: bookingQueryKeys.byReservationKey(reservationKey) });
      devLog.error('❌ Failed to cancel booking via SSO - reverting optimistic update:', error);
    },
    ...options,
  });
};

/**
 * Hook for wallet-based cancelBooking using useContractWriteFunction
 * Cancels an existing booking using user's wallet
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useCancelBookingWallet = (options = {}) => {
  const queryClient = useQueryClient();
  const { contractWriteFunction: cancelBooking } = useContractWriteFunction('cancelBooking');

  return useMutation({
    mutationFn: async (reservationKey) => {
      const txHash = await cancelBooking([reservationKey]);
      
      devLog.log('🔍 useCancelBookingWallet - Transaction Hash:', txHash);
      return { hash: txHash };
    },
    onSuccess: (result, reservationKey) => {
      // Optimistic update: mark booking as cancelled in cache to remove from UI immediately
      queryClient.setQueryData(bookingQueryKeys.byReservationKey(reservationKey), (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          reservation: {
            ...oldData.reservation,
            status: '4', // Cancelled status
            isCancelled: true
          }
        };
      });
      devLog.log('✅ Booking marked as cancelled via wallet (optimistic update)');
    },
    onError: (error, reservationKey) => {
      // Revert optimistic update on error
      queryClient.invalidateQueries({ queryKey: bookingQueryKeys.byReservationKey(reservationKey) });
      devLog.error('❌ Failed to cancel booking via wallet - reverting optimistic update:', error);
    },
    ...options,
  });
};

/**
 * Unified Hook for cancelling bookings (auto-detects SSO vs Wallet)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useCancelBooking = (options = {}) => {
  const { isSSO } = useUser();
  
  // Call both hooks unconditionally to follow rules of hooks
  const ssoMutation = useCancelBookingSSO(options);
  const walletMutation = useCancelBookingWallet(options);
  
  // Return the appropriate mutation
  return isSSO ? ssoMutation : walletMutation;
};

/**
 * Hook for /api/contract/reservation/requestFundsSSO endpoint
 * Requests funds for SSO users
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useRequestFundsSSO = (options = {}) => {
  const queryClient = useQueryClient();
  const { address } = useUser();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/contract/reservation/requestFundsSSO', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      if (!response.ok) {
        throw new Error(`Failed to request funds: ${response.status}`);
      }

      const data = await response.json();
      devLog.log('🔍 useRequestFundsSSO:', data);
      return data;
    },
    onSuccess: (data) => {
      // Invalidate safe balance and related queries
      queryClient.invalidateQueries({ queryKey: bookingQueryKeys.safeBalance(address || '') });
      devLog.log('✅ Funds requested successfully, cache invalidated');
    },
    onError: (error) => {
      devLog.error('❌ Failed to request funds:', error);
    },
    ...options,
  });
};

/**
 * Hook for wallet-based requestFunds using useContractWriteFunction
 * Requests funds using user's wallet
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useRequestFundsWallet = (options = {}) => {
  const queryClient = useQueryClient();
  const { address } = useUser();
  const { contractWriteFunction: requestFunds } = useContractWriteFunction('requestFunds');

  return useMutation({
    mutationFn: async () => {
      const txHash = await requestFunds([]);
      
      devLog.log('🔍 useRequestFundsWallet - Transaction Hash:', txHash);
      return { hash: txHash };
    },
    onSuccess: (result) => {
      // Invalidate safe balance and related queries
      queryClient.invalidateQueries({ queryKey: bookingQueryKeys.safeBalance(address || '') });
      devLog.log('✅ Funds requested successfully via wallet, cache invalidated');
    },
    onError: (error) => {
      devLog.error('❌ Failed to request funds via wallet:', error);
    },
    ...options,
  });
};

/**
 * Unified Hook for requesting funds (auto-detects SSO vs Wallet)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useRequestFunds = (options = {}) => {
  const { isSSO } = useUser();
  
  // Call both hooks unconditionally to follow rules of hooks
  const ssoMutation = useRequestFundsSSO(options);
  const walletMutation = useRequestFundsWallet(options);
  
  // Return the appropriate mutation
  return isSSO ? ssoMutation : walletMutation;
};

// Re-export cache updates utility
export { useBookingCacheUpdates } from './useBookingCacheUpdates';
