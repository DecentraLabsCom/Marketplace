/**
 * Atomic React Query Hooks for Reservation/Booking-related API endpoints
 * Each hook maps 1:1 to a specific API endpoint in /api/contract/reservation/
 * 
 * Configuration:
 * - staleTime: 15 minutes (900,000ms)
 * - gcTime: 60 minutes (3,600,000ms)
 * - refetchOnWindowFocus: false
 * - refetchInterval: false
 * - refetchOnReconnect: true
 * - retry: 1
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import useContractWriteFunction from '@/hooks/contract/useContractWriteFunction'
import { createSSRSafeQuery } from '@/utils/hooks/ssrSafe'
import { useUser } from '@/context/UserContext'
import { bookingQueryKeys } from '@/utils/hooks/queryKeys'
import devLog from '@/utils/dev/logger'

// Export composed hooks
export * from '../../utils/hooks/queries/bookingsComposedQueries'

// Common configuration for all booking/reservation hooks
export const BOOKING_QUERY_CONFIG = {
  staleTime: 15 * 60 * 1000,       // 15 minutes
  gcTime: 60 * 60 * 1000,          // 60 minutes
  refetchOnWindowFocus: false,
  refetchInterval: false,
  refetchOnReconnect: true,
  retry: 1,
}

/**
 * Hook for /api/contract/reservation/getAllReservations endpoint
 * Gets all reservations from the smart contract
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with all reservations data
 */
export const useAllReservations = (options = {}) => {
  return useQuery({
    queryKey: ['reservations', 'getAllReservations'],
    queryFn: createSSRSafeQuery(
      async () => {
        const response = await fetch('/api/contract/reservation/getAllReservations', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch all reservations: ${response.status}`);
        }
        
        const data = await response.json();
        devLog.log('🔍 useAllReservations:', data);
        return data;
      },
      [] // Return empty array during SSR
    ),
    ...BOOKING_QUERY_CONFIG,
    ...options,
  });
};

/**
 * Hook for /api/contract/reservation/getReservation endpoint
 * Gets specific reservation data by reservation key
 * @param {string} reservationKey - Reservation key to fetch
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with reservation data
 */
export const useReservation = (reservationKey, options = {}) => {
  return useQuery({
    queryKey: ['reservations', 'getReservation', reservationKey],
    queryFn: createSSRSafeQuery(
      async () => {
        if (!reservationKey) throw new Error('Reservation key is required');
        
        const response = await fetch(`/api/contract/reservation/getReservation?reservationKey=${reservationKey}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch reservation ${reservationKey}: ${response.status}`);
        }
        
        const data = await response.json();
        devLog.log('🔍 useReservation:', reservationKey, data);
        return data;
      },
      null // Return null during SSR
    ),
    enabled: !!reservationKey,
    ...BOOKING_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks
useReservation.queryFn = async (reservationKey) => {
  if (!reservationKey) throw new Error('Reservation key is required');
  
  const response = await fetch(`/api/contract/reservation/getReservation?reservationKey=${reservationKey}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch reservation ${reservationKey}: ${response.status}`);
  }
  
  const data = await response.json();
  devLog.log('🔍 useReservation.queryFn:', reservationKey, data);
  return data;
};

/**
 * Hook for /api/contract/reservation/getReservationsOfToken endpoint
 * Gets all reservations for a specific lab token
 * @param {string|number} labId - Lab ID to get reservations for
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with lab reservations
 */
export const useReservationsOfToken = (labId, options = {}) => {
  return useQuery({
    queryKey: ['reservations', 'getReservationsOfToken', labId],
    queryFn: createSSRSafeQuery(
      async () => {
        if (!labId) throw new Error('Lab ID is required');
        
        const response = await fetch(`/api/contract/reservation/getReservationsOfToken?labId=${labId}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch reservations for lab ${labId}: ${response.status}`);
        }
        
        const data = await response.json();
        // Only log if there are reservations or if there's an error
        if (data.count > 0) {
          devLog.log('🔍 useReservationsOfToken:', labId, `Found ${data.count} reservations`);
        }
        return data;
      },
      [] // Return empty array during SSR
    ),
    enabled: !!labId,
    ...BOOKING_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks
useReservationsOfToken.queryFn = async (labId) => {
  if (!labId) throw new Error('Lab ID is required');
  
  const response = await fetch(`/api/contract/reservation/getReservationsOfToken?labId=${labId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch reservations for lab ${labId}: ${response.status}`);
  }
  
  const data = await response.json();
  devLog.log('🔍 useReservationsOfToken.queryFn:', labId, data);
  return data;
};

/**
 * Hook for /api/contract/reservation/getReservationOfTokenByIndex endpoint
 * Gets reservation at specific index for a lab token
 * @param {string|number} labId - Lab ID
 * @param {number} index - Index of the reservation
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with reservation data
 */
export const useReservationOfTokenByIndex = (labId, index, options = {}) => {
  return useQuery({
    queryKey: ['reservations', 'getReservationOfTokenByIndex', labId, index],
    queryFn: createSSRSafeQuery(
      async () => {
        if (!labId || index === undefined || index === null) {
          throw new Error('Lab ID and index are required');
        }
        
        const response = await fetch(`/api/contract/reservation/getReservationOfTokenByIndex?labId=${labId}&index=${index}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch reservation at index ${index} for lab ${labId}: ${response.status}`);
        }
        
        const data = await response.json();
        devLog.log('🔍 useReservationOfTokenByIndex:', labId, index, data);
        return data;
      },
      null // Return null during SSR
    ),
    enabled: !!labId && (index !== undefined && index !== null),
    ...BOOKING_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks
useReservationOfTokenByIndex.queryFn = async (labId, index) => {
  if (!labId || index === undefined || index === null) {
    throw new Error('Lab ID and index are required');
  }
  
  const response = await fetch(`/api/contract/reservation/getReservationOfTokenByIndex?labId=${labId}&index=${index}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch reservation at index ${index} for lab ${labId}: ${response.status}`);
  }
  
  const data = await response.json();
  devLog.log('🔍 useReservationOfTokenByIndex.queryFn:', labId, index, data);
  return data;
};

/**
 * Hook for /api/contract/reservation/reservationsOf endpoint
 * Gets all reservations made by a specific user
 * @param {string} userAddress - User address to get reservations for
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with user reservations
 */
export const useReservationsOf = (userAddress, options = {}) => {
  return useQuery({
    queryKey: ['reservations', 'reservationsOf', userAddress],
    queryFn: createSSRSafeQuery(
      async () => {
        if (!userAddress) throw new Error('User address is required');
        
        const response = await fetch(`/api/contract/reservation/reservationsOf?userAddress=${userAddress}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch reservations for user ${userAddress}: ${response.status}`);
        }
        
        const data = await response.json();
        devLog.log('🔍 useReservationsOf:', userAddress, data);
        return data;
      },
      [] // Return empty array during SSR
    ),
    enabled: !!userAddress,
    ...BOOKING_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks
useReservationsOf.queryFn = async (userAddress) => {
  if (!userAddress) throw new Error('User address is required');
  
  const response = await fetch('/api/contract/reservation/getReservationsOf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userAddress })
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch reservations for user ${userAddress}: ${response.status}`);
  }
  
  const data = await response.json();
  devLog.log('🔍 useReservationsOf.queryFn:', userAddress, data);
  return data;
};

/**
 * Hook for /api/contract/reservation/reservationKeyByIndex endpoint
 * Gets reservation key at specific global index
 * @param {number} index - Global index of the reservation
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with reservation key
 */
export const useReservationKeyByIndex = (index, options = {}) => {
  return useQuery({
    queryKey: ['reservations', 'reservationKeyByIndex', index],
    queryFn: createSSRSafeQuery(
      async () => {
        if (index === undefined || index === null) {
          throw new Error('Index is required');
        }
        
        const response = await fetch('/api/contract/reservation/reservationKeyByIndex', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ index: index.toString() })
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch reservation key at index ${index}: ${response.status}`);
        }
        
        const data = await response.json();
        devLog.log('🔍 useReservationKeyByIndex:', index, data);
        return data;
      },
      { reservationKey: null } // Return null during SSR
    ),
    enabled: (index !== undefined && index !== null),
    ...BOOKING_QUERY_CONFIG,
    ...options,
  });
};

/**
 * Hook for /api/contract/reservation/reservationKeyOfUserByIndex endpoint
 * Gets reservation key at specific index for a user
 * @param {string} userAddress - User address
 * @param {number} index - User's reservation index
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with reservation key
 */
export const useReservationKeyOfUserByIndex = (userAddress, index, options = {}) => {
  return useQuery({
    queryKey: ['reservations', 'reservationKeyOfUserByIndex', userAddress, index],
    queryFn: createSSRSafeQuery(
      async () => {
        if (!userAddress || index === undefined || index === null) {
          throw new Error('User address and index are required');
        }
        
        const response = await fetch('/api/contract/reservation/reservationKeyOfUserByIndex', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            user: userAddress,
            index: index.toString()
          })
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch reservation key at index ${index} for user ${userAddress}: ${response.status}`);
        }
        
        const data = await response.json();
        devLog.log('🔍 useReservationKeyOfUserByIndex:', userAddress, index, data);
        return data;
      },
      { reservationKey: null } // Return null during SSR
    ),
    enabled: !!userAddress && (index !== undefined && index !== null),
    ...BOOKING_QUERY_CONFIG,
    ...options,
  });
};

/**
 * Hook for /api/contract/reservation/totalReservations endpoint
 * Gets the total count of all reservations
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with total count
 */
export const useTotalReservations = (options = {}) => {
  return useQuery({
    queryKey: ['reservations', 'totalReservations'],
    queryFn: createSSRSafeQuery(
      async () => {
        const response = await fetch('/api/contract/reservation/totalReservations', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch total reservations: ${response.status}`);
        }
        
        const data = await response.json();
        devLog.log('🔍 useTotalReservations:', data);
        return data;
      },
      { total: '0' } // Return zero during SSR
    ),
    ...BOOKING_QUERY_CONFIG,
    ...options,
  });
};

/**
 * Hook for /api/contract/reservation/userOfReservation endpoint
 * Gets the user address that made a specific reservation
 * @param {string} reservationKey - Reservation key
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with user address
 */
export const useUserOfReservation = (reservationKey, options = {}) => {
  return useQuery({
    queryKey: ['reservations', 'userOfReservation', reservationKey],
    queryFn: createSSRSafeQuery(
      async () => {
        if (!reservationKey) throw new Error('Reservation key is required');
        
        const response = await fetch('/api/contract/reservation/userOfReservation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reservationKey })
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch user for reservation ${reservationKey}: ${response.status}`);
        }
        
        const data = await response.json();
        devLog.log('🔍 useUserOfReservation:', reservationKey, data);
        return data;
      },
      { user: null } // Return null during SSR
    ),
    enabled: !!reservationKey,
    ...BOOKING_QUERY_CONFIG,
    ...options,
  });
};

/**
 * Hook for /api/contract/reservation/checkAvailable endpoint
 * Checks if a lab is available for booking at specified time
 * @param {string|number} labId - Lab ID
 * @param {number} start - Start timestamp
 * @param {number} duration - Duration in seconds
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with availability status
 */
export const useCheckAvailable = (labId, start, duration, options = {}) => {
  return useQuery({
    queryKey: ['reservations', 'checkAvailable', labId, start, duration],
    queryFn: createSSRSafeQuery(
      async () => {
        if (!labId || !start || !duration) {
          throw new Error('Lab ID, start time, and duration are required');
        }
        
        const response = await fetch('/api/contract/reservation/checkAvailable', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            labId: labId.toString(),
            start: start.toString(),
            duration: duration.toString()
          })
        });
        
        if (!response.ok) {
          throw new Error(`Failed to check availability for lab ${labId}: ${response.status}`);
        }
        
        const data = await response.json();
        devLog.log('🔍 useCheckAvailable:', labId, start, duration, data);
        return data;
      },
      { available: false } // Return false during SSR
    ),
    enabled: !!(labId && start && duration),
    ...BOOKING_QUERY_CONFIG,
    ...options,
  });
};

/**
 * Hook for /api/contract/reservation/hasActiveBooking endpoint
 * Checks if a user has any active booking
 * @param {string} userAddress - User address to check
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with active booking status
 */
export const useHasActiveBooking = (userAddress, options = {}) => {
  return useQuery({
    queryKey: ['reservations', 'hasActiveBooking', userAddress],
    queryFn: createSSRSafeQuery(
      async () => {
        if (!userAddress) throw new Error('User address is required');
        
        const response = await fetch('/api/contract/reservation/hasActiveBooking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user: userAddress })
        });
        
        if (!response.ok) {
          throw new Error(`Failed to check active booking for user ${userAddress}: ${response.status}`);
        }
        
        const data = await response.json();
        devLog.log('🔍 useHasActiveBooking:', userAddress, data);
        return data;
      },
      { hasActiveBooking: false } // Return false during SSR
    ),
    enabled: !!userAddress,
    ...BOOKING_QUERY_CONFIG,
    ...options,
  });
};

/**
 * Hook for /api/contract/reservation/hasActiveBookingByToken endpoint
 * Checks if a specific lab token has any active booking
 * @param {string|number} labId - Lab ID to check
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with active booking status for the lab
 */
export const useHasActiveBookingByToken = (labId, options = {}) => {
  return useQuery({
    queryKey: ['reservations', 'hasActiveBookingByToken', labId],
    queryFn: createSSRSafeQuery(
      async () => {
        if (!labId) throw new Error('Lab ID is required');
        
        const response = await fetch('/api/contract/reservation/hasActiveBookingByToken', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokenId: labId.toString() })
        });
        
        if (!response.ok) {
          throw new Error(`Failed to check active booking for lab ${labId}: ${response.status}`);
        }
        
        const data = await response.json();
        devLog.log('🔍 useHasActiveBookingByToken:', labId, data);
        return data;
      },
      { hasActiveBooking: false } // Return false during SSR
    ),
    enabled: !!labId,
    ...BOOKING_QUERY_CONFIG,
    ...options,
  });
};

/**
 * Hook for /api/contract/reservation/isTokenListed endpoint
 * Checks if a lab token is currently listed for booking
 * @param {string|number} labId - Lab ID to check
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with listing status
 */
export const useIsTokenListed = (labId, options = {}) => {
  return useQuery({
    queryKey: ['reservations', 'isTokenListed', labId],
    queryFn: createSSRSafeQuery(
      async () => {
        if (!labId) throw new Error('Lab ID is required');
        
        const response = await fetch('/api/contract/reservation/isTokenListed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokenId: labId.toString() })
        });
        
        if (!response.ok) {
          throw new Error(`Failed to check listing status for lab ${labId}: ${response.status}`);
        }
        
        const data = await response.json();
        devLog.log('🔍 useIsTokenListed:', labId, data);
        return data;
      },
      { isListed: false } // Return false during SSR
    ),
    enabled: !!labId,
    ...BOOKING_QUERY_CONFIG,
    ...options,
  });
};

/**
 * Hook for /api/contract/reservation/getLabTokenAddress endpoint
 * Gets the token contract address for lab tokens
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with token contract address
 */
export const useLabTokenAddress = (options = {}) => {
  return useQuery({
    queryKey: ['reservations', 'getLabTokenAddress'],
    queryFn: createSSRSafeQuery(
      async () => {
        const response = await fetch('/api/contract/reservation/getLabTokenAddress', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch lab token address: ${response.status}`);
        }
        
        const data = await response.json();
        devLog.log('🔍 useLabTokenAddress:', data);
        return data;
      },
      { tokenAddress: null } // Return null during SSR
    ),
    ...BOOKING_QUERY_CONFIG,
    ...options,
  });
};

/**
 * Hook for /api/contract/reservation/getSafeBalance endpoint
 * Gets the safe balance for a specific user
 * @param {string} userAddress - User address to get balance for
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with safe balance
 */
export const useSafeBalance = (userAddress, options = {}) => {
  return useQuery({
    queryKey: ['reservations', 'getSafeBalance', userAddress],
    queryFn: createSSRSafeQuery(
      async () => {
        if (!userAddress) throw new Error('User address is required');
        
        const response = await fetch('/api/contract/reservation/getSafeBalance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user: userAddress })
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch safe balance for user ${userAddress}: ${response.status}`);
        }
        
        const data = await response.json();
        devLog.log('🔍 useSafeBalance:', userAddress, data);
        return data;
      },
      { balance: '0' } // Return zero balance during SSR
    ),
    enabled: !!userAddress,
    ...BOOKING_QUERY_CONFIG,
    ...options,
  });
};

// ===== MUTATIONS =====

/**
 * Hook for /api/contract/reservation/reservationRequest endpoint using wallet (non-SSO users)  
 * Creates a new reservation request using user's wallet
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useReservationRequestWallet = (options = {}) => {
  const queryClient = useQueryClient();
  const { contractWriteFunction: reservationRequest } = useContractWriteFunction('reservationRequest');

  return useMutation({
    mutationFn: async (requestData) => {
      const txHash = await reservationRequest([requestData.tokenId, requestData.start, requestData.end]);
      
      devLog.log('🔍 useReservationRequestWallet - Transaction Hash:', txHash);
      return { hash: txHash };
    },
    onSuccess: (result, variables) => {
      // Invalidate reservation queries
      queryClient.invalidateQueries(['reservations']);
      if (variables.tokenId) {
        queryClient.invalidateQueries(['reservations', 'getReservationsOfToken', variables.tokenId]);
        queryClient.invalidateQueries(['reservations', 'hasActiveBookingByToken', variables.tokenId]);
      }
      devLog.log('✅ Reservation request created successfully via wallet, cache invalidated');
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
      // Invalidate reservation queries
      queryClient.invalidateQueries(['reservations']);
      if (variables.tokenId) {
        queryClient.invalidateQueries(['reservations', 'getReservationsOfToken', variables.tokenId]);
        queryClient.invalidateQueries(['reservations', 'hasActiveBookingByToken', variables.tokenId]);
      }
      devLog.log('✅ SSO Reservation request created successfully, cache invalidated');
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
  const ssoMutation = useReservationRequestSSO(options);
  const walletMutation = useReservationRequestWallet(options);

  return useMutation({
    mutationFn: async (requestData) => {
      if (isSSO) {
        return await ssoMutation.mutateAsync(requestData);
      } else {
        return await walletMutation.mutateAsync(requestData);
      }
    },
    onSuccess: (data, variables) => {
      devLog.log('✅ Reservation request created successfully via unified hook');
    },
    onError: (error) => {
      devLog.error('❌ Failed to create reservation request via unified hook:', error);
    },
    ...options,
  });
};

/**
 * Hook for /api/contract/reservation/cancelReservationRequest endpoint using server wallet (SSO users)
 * Cancels a reservation request using server wallet for SSO users
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useCancelReservationRequestSSO = (options = {}) => {
  const queryClient = useQueryClient();

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
      // Optimistic update: mark reservation as cancelled in cache to remove from UI immediately
      queryClient.setQueryData(['reservations', 'getReservation', reservationKey], (oldData) => {
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
      devLog.log('✅ Reservation request marked as cancelled in cache (optimistic update)');
    },
    onError: (error, reservationKey) => {
      // Revert optimistic update on error
      queryClient.invalidateQueries(['reservations', 'getReservation', reservationKey]);
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
      queryClient.setQueryData(['reservations', 'getReservation', reservationKey], (oldData) => {
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
      queryClient.invalidateQueries(['reservations', 'getReservation', reservationKey]);
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
  const ssoMutation = useCancelReservationRequestSSO(options);
  const walletMutation = useCancelReservationRequestWallet(options);

  return useMutation({
    mutationFn: async (reservationKey) => {
      if (isSSO) {
        return ssoMutation.mutateAsync(reservationKey);
      } else {
        return walletMutation.mutateAsync(reservationKey);
      }
    },
    onSuccess: (data, reservationKey) => {
      devLog.log('✅ Reservation request cancelled successfully via unified hook');
    },
    onError: (error) => {
      devLog.error('❌ Failed to cancel reservation request via unified hook:', error);
    },
    ...options,
  });
};

/**
 * Hook for /api/contract/reservation/confirmReservationRequest endpoint using server wallet (SSO users)
 * Confirms a reservation request using server wallet for SSO users (provider action)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useConfirmReservationRequestSSO = (options = {}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reservationKey) => {
      const response = await fetch('/api/contract/reservation/confirmReservationRequest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservationKey })
      });

      if (!response.ok) {
        throw new Error(`Failed to confirm reservation request: ${response.status}`);
      }

      const data = await response.json();
      devLog.log('🔍 useConfirmReservationRequestSSO:', data);
      return data;
    },
    onSuccess: (data, reservationKey) => {
      // Update reservation status in cache
      queryClient.invalidateQueries(['reservations', 'getReservation', reservationKey]);
      queryClient.invalidateQueries(['reservations']);
      devLog.log('✅ Reservation request confirmed successfully via SSO, cache updated');
    },
    onError: (error) => {
      devLog.error('❌ Failed to confirm reservation request via SSO:', error);
    },
    ...options,
  });
};

/**
 * Hook for wallet-based confirmReservationRequest using useContractWriteFunction
 * Confirms a reservation request using user's wallet (provider action)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useConfirmReservationRequestWallet = (options = {}) => {
  const queryClient = useQueryClient();
  const { contractWriteFunction: confirmReservationRequest } = useContractWriteFunction('confirmReservationRequest');

  return useMutation({
    mutationFn: async (reservationKey) => {
      const txHash = await confirmReservationRequest([reservationKey]);
      
      devLog.log('🔍 useConfirmReservationRequestWallet - Transaction Hash:', txHash);
      return { hash: txHash };
    },
    onSuccess: (result, reservationKey) => {
      // Update reservation status in cache
      queryClient.invalidateQueries(['reservations', 'getReservation', reservationKey]);
      queryClient.invalidateQueries(['reservations']);
      devLog.log('✅ Reservation request confirmed successfully via wallet, cache updated');
    },
    onError: (error) => {
      devLog.error('❌ Failed to confirm reservation request via wallet:', error);
    },
    ...options,
  });
};

/**
 * Unified Hook for confirming reservation requests (auto-detects SSO vs Wallet)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useConfirmReservationRequest = (options = {}) => {
  const { isSSO } = useUser();
  const ssoMutation = useConfirmReservationRequestSSO(options);
  const walletMutation = useConfirmReservationRequestWallet(options);

  return useMutation({
    mutationFn: async (reservationKey) => {
      if (isSSO) {
        return ssoMutation.mutateAsync(reservationKey);
      } else {
        return walletMutation.mutateAsync(reservationKey);
      }
    },
    onSuccess: (data, reservationKey) => {
      devLog.log('✅ Reservation request confirmed successfully via unified hook');
    },
    onError: (error) => {
      devLog.error('❌ Failed to confirm reservation request via unified hook:', error);
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
      queryClient.removeQueries(['reservations', 'getReservation', reservationKey]);
      queryClient.invalidateQueries(['reservations']);
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
      queryClient.removeQueries(['reservations', 'getReservation', reservationKey]);
      queryClient.invalidateQueries(['reservations']);
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
  const ssoMutation = useDenyReservationRequestSSO(options);
  const walletMutation = useDenyReservationRequestWallet(options);

  return useMutation({
    mutationFn: async (reservationKey) => {
      if (isSSO) {
        return ssoMutation.mutateAsync(reservationKey);
      } else {
        return walletMutation.mutateAsync(reservationKey);
      }
    },
    onSuccess: (data, reservationKey) => {
      devLog.log('✅ Reservation request denied successfully via unified hook');
    },
    onError: (error) => {
      devLog.error('❌ Failed to deny reservation request via unified hook:', error);
    },
    ...options,
  });
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
      queryClient.setQueryData(['reservations', 'getReservation', reservationKey], (oldData) => {
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
      queryClient.invalidateQueries(['reservations', 'getReservation', reservationKey]);
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
      queryClient.setQueryData(['reservations', 'getReservation', reservationKey], (oldData) => {
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
      queryClient.invalidateQueries(['reservations', 'getReservation', reservationKey]);
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
  const ssoMutation = useCancelBookingSSO(options);
  const walletMutation = useCancelBookingWallet(options);

  return useMutation({
    mutationFn: async (reservationKey) => {
      if (isSSO) {
        return ssoMutation.mutateAsync(reservationKey);
      } else {
        return walletMutation.mutateAsync(reservationKey);
      }
    },
    onSuccess: (data, reservationKey) => {
      devLog.log('✅ Booking cancelled successfully via unified hook');
    },
    onError: (error) => {
      devLog.error('❌ Failed to cancel booking via unified hook:', error);
    },
    ...options,
  });
};

/**
 * Hook for /api/contract/reservation/listToken endpoint using server wallet (SSO users)
 * Lists a lab token for booking using server wallet for SSO users
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useListTokenSSO = (options = {}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tokenId) => {
      const response = await fetch('/api/contract/reservation/listToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenId })
      });

      if (!response.ok) {
        throw new Error(`Failed to list token: ${response.status}`);
      }

      const data = await response.json();
      devLog.log('🔍 useListTokenSSO:', data);
      return data;
    },
    onSuccess: (data, tokenId) => {
      // Invalidate listing-related queries
      queryClient.invalidateQueries(['reservations', 'isTokenListed', tokenId]);
      queryClient.invalidateQueries(['reservations']);
      devLog.log('✅ Token listed successfully via SSO, cache invalidated');
    },
    onError: (error) => {
      devLog.error('❌ Failed to list token via SSO:', error);
    },
    ...options,
  });
};

/**
 * Hook for wallet-based listToken using useContractWriteFunction
 * Lists a lab token for booking using user's wallet
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useListTokenWallet = (options = {}) => {
  const queryClient = useQueryClient();
  const { contractWriteFunction: listToken } = useContractWriteFunction('listToken');

  return useMutation({
    mutationFn: async (tokenId) => {
      const txHash = await listToken([tokenId]);
      
      devLog.log('🔍 useListTokenWallet - Transaction Hash:', txHash);
      return { hash: txHash };
    },
    onSuccess: (result, tokenId) => {
      // Invalidate listing-related queries
      queryClient.invalidateQueries(['reservations', 'isTokenListed', tokenId]);
      queryClient.invalidateQueries(['reservations']);
      devLog.log('✅ Token listed successfully via wallet, cache invalidated');
    },
    onError: (error) => {
      devLog.error('❌ Failed to list token via wallet:', error);
    },
    ...options,
  });
};

/**
 * Unified Hook for listing tokens (auto-detects SSO vs Wallet)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useListToken = (options = {}) => {
  const { isSSO } = useUser();
  const ssoMutation = useListTokenSSO(options);
  const walletMutation = useListTokenWallet(options);

  return useMutation({
    mutationFn: async (tokenId) => {
      if (isSSO) {
        return ssoMutation.mutateAsync(tokenId);
      } else {
        return walletMutation.mutateAsync(tokenId);
      }
    },
    onSuccess: (data, tokenId) => {
      devLog.log('✅ Token listed successfully via unified hook');
    },
    onError: (error) => {
      devLog.error('❌ Failed to list token via unified hook:', error);
    },
    ...options,
  });
};

/**
 * Hook for /api/contract/reservation/unlistToken endpoint using server wallet (SSO users)
 * Unlists a lab token from booking using server wallet for SSO users
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useUnlistTokenSSO = (options = {}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tokenId) => {
      const response = await fetch('/api/contract/reservation/unlistToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenId })
      });

      if (!response.ok) {
        throw new Error(`Failed to unlist token: ${response.status}`);
      }

      const data = await response.json();
      devLog.log('🔍 useUnlistTokenSSO:', data);
      return data;
    },
    onSuccess: (data, tokenId) => {
      // Invalidate listing-related queries
      queryClient.invalidateQueries(['reservations', 'isTokenListed', tokenId]);
      queryClient.invalidateQueries(['reservations']);
      devLog.log('✅ Token unlisted successfully via SSO, cache invalidated');
    },
    onError: (error) => {
      devLog.error('❌ Failed to unlist token via SSO:', error);
    },
    ...options,
  });
};

/**
 * Hook for wallet-based unlistToken using useContractWriteFunction
 * Unlists a lab token from booking using user's wallet
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useUnlistTokenWallet = (options = {}) => {
  const queryClient = useQueryClient();
  const { contractWriteFunction: unlistToken } = useContractWriteFunction('unlistToken');

  return useMutation({
    mutationFn: async (tokenId) => {
      const txHash = await unlistToken([tokenId]);
      
      devLog.log('🔍 useUnlistTokenWallet - Transaction Hash:', txHash);
      return { hash: txHash };
    },
    onSuccess: (result, tokenId) => {
      // Invalidate listing-related queries
      queryClient.invalidateQueries(['reservations', 'isTokenListed', tokenId]);
      queryClient.invalidateQueries(['reservations']);
      devLog.log('✅ Token unlisted successfully via wallet, cache invalidated');
    },
    onError: (error) => {
      devLog.error('❌ Failed to unlist token via wallet:', error);
    },
    ...options,
  });
};

/**
 * Unified Hook for unlisting tokens (auto-detects SSO vs Wallet)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useUnlistToken = (options = {}) => {
  const { isSSO } = useUser();
  const ssoMutation = useUnlistTokenSSO(options);
  const walletMutation = useUnlistTokenWallet(options);

  return useMutation({
    mutationFn: async (tokenId) => {
      if (isSSO) {
        return ssoMutation.mutateAsync(tokenId);
      } else {
        return walletMutation.mutateAsync(tokenId);
      }
    },
    onSuccess: (data, tokenId) => {
      devLog.log('✅ Token unlisted successfully via unified hook');
    },
    onError: (error) => {
      devLog.error('❌ Failed to unlist token via unified hook:', error);
    },
    ...options,
  });
};

/**
 * Hook for /api/contract/reservation/requestFundsSSO endpoint
 * Requests funds for SSO users
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useRequestFundsSSO = (options = {}) => {
  const queryClient = useQueryClient();

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
      queryClient.invalidateQueries(['reservations', 'getSafeBalance']);
      devLog.log('✅ Funds requested successfully, cache invalidated');
    },
    onError: (error) => {
      devLog.error('❌ Failed to request funds:', error);
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
  const ssoMutation = useRequestFundsSSO(options);
  const walletMutation = useRequestFundsWallet(options);

  return useMutation({
    mutationFn: async () => {
      if (isSSO) {
        return ssoMutation.mutateAsync();
      } else {
        return walletMutation.mutateAsync();
      }
    },
    onSuccess: (data) => {
      devLog.log('✅ Funds requested successfully via unified hook');
    },
    onError: (error) => {
      devLog.error('❌ Failed to request funds via unified hook:', error);
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
  const { contractWriteFunction: requestFunds } = useContractWriteFunction('requestFunds');

  return useMutation({
    mutationFn: async () => {
      const txHash = await requestFunds([]);
      
      devLog.log('🔍 useRequestFundsWallet - Transaction Hash:', txHash);
      return { hash: txHash };
    },
    onSuccess: (result) => {
      // Invalidate safe balance and related queries
      queryClient.invalidateQueries(['reservations', 'getSafeBalance']);
      devLog.log('✅ Funds requested successfully via wallet, cache invalidated');
    },
    onError: (error) => {
      devLog.error('❌ Failed to request funds via wallet:', error);
    },
    ...options,
  });
};

/**
 * Create Booking Mutation Hook (Unified)
 * @param {Object} options - Mutation options
 * @returns {Object} React Query mutation for creating bookings
 */
export const useCreateBookingMutation = (options = {}) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (bookingData) => {
      const { labId, start, timeslot, userAddress } = bookingData;
      
      // Use SSO endpoint if no userAddress provided (server wallet)
      const endpoint = userAddress ? 
        '/api/contract/reservation/reservationRequest' : 
        '/api/contract/reservation/reservationRequestSSO';
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labId, start, timeslot, userAddress }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create booking');
      }
      
      return response.json();
    },
    onSuccess: (data, variables) => {
      // Invalidate relevant booking queries
      queryClient.invalidateQueries({ queryKey: bookingQueryKeys.all() });
      if (variables.userAddress) {
        queryClient.invalidateQueries({ 
          queryKey: bookingQueryKeys.byUser(variables.userAddress) 
        });
      }
      if (variables.labId) {
        queryClient.invalidateQueries({ 
          queryKey: bookingQueryKeys.byLab(variables.labId) 
        });
      }
      devLog.log('✅ Booking created successfully');
    },
    onError: (error) => {
      devLog.error('❌ Failed to create booking:', error);
    },
    ...options,
  });
};

/**
 * Cancel Booking Mutation Hook
 * @param {Object} options - Mutation options
 * @returns {Object} React Query mutation for canceling bookings
 */
export const useCancelBookingMutation = (options = {}) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (reservationKey) => {
      const response = await fetch('/api/contract/reservation/cancelBooking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservationKey }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to cancel booking');
      }
      
      return response.json();
    },
    onSuccess: (data, reservationKey) => {
      // Invalidate relevant booking queries
      queryClient.invalidateQueries({ queryKey: bookingQueryKeys.all() });
      queryClient.invalidateQueries({ 
        queryKey: bookingQueryKeys.byReservationKey(reservationKey) 
      });
      devLog.log('✅ Booking canceled successfully');
    },
    onError: (error) => {
      devLog.error('❌ Failed to cancel booking:', error);
    },
    ...options,
  });
};

// Re-export cache updates utility
export { useBookingCacheUpdates } from './useBookingCacheUpdates';