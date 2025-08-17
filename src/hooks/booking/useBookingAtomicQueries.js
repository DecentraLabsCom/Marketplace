/**
 * Atomic React Query Hooks for Booking-related Read Operations
 * Each hook maps 1:1 to a specific API endpoint in /api/contract/reservation/
 * Handles queries (read operations)
 * 
 * Configuration:
 * - staleTime: 15 minutes (900,000ms)
 * - gcTime: 60 minutes (3,600,000ms)
 * - refetchOnWindowFocus: false
 * - refetchInterval: false
 * - refetchOnReconnect: true
 * - retry: 1
 *
 */
import { useQuery } from '@tanstack/react-query'
import { createSSRSafeQuery } from '@/utils/hooks/ssrSafe'
import { bookingQueryKeys } from '@/utils/hooks/queryKeys'
import devLog from '@/utils/dev/logger'

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
    queryKey: bookingQueryKeys.all(),
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
    queryKey: bookingQueryKeys.byReservationKey(reservationKey),
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
    queryKey: bookingQueryKeys.getReservationsOfToken(labId),
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
    queryKey: bookingQueryKeys.getReservationOfTokenByIndex(labId, index),
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
    queryKey: bookingQueryKeys.reservationsOf(userAddress),
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
    queryKey: bookingQueryKeys.reservationKeyByIndex(index),
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
    queryKey: bookingQueryKeys.reservationKeyOfUserByIndex(userAddress, index),
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
    queryKey: bookingQueryKeys.totalReservations(),
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
    queryKey: bookingQueryKeys.userOfReservation(reservationKey),
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
    queryKey: bookingQueryKeys.checkAvailable(labId, start, duration),
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
    queryKey: bookingQueryKeys.hasActiveBooking(userAddress),
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
    queryKey: bookingQueryKeys.hasActiveBookingByToken(labId),
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
    queryKey: bookingQueryKeys.isTokenListed(labId),
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
    queryKey: bookingQueryKeys.labTokenAddress(),
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
    queryKey: bookingQueryKeys.safeBalance(userAddress),
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
