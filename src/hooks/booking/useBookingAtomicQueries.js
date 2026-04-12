/**
 * Atomic React Query Hooks for Booking-related Read Operations.
 * Marketplace runtime is institutional-only, so the active exports route
 * through backend/API reads rather than customer wallet reads.
 * 
 * Configuration:
 * - staleTime: 15 minutes (900,000ms)
 * - gcTime: 60 minutes (3,600,000ms)
 * - refetchOnWindowFocus: false
 * - refetchInterval: false
 * - refetchOnReconnect: true
 * - retry: 1
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

// ===== useReservation Hook Family =====

// Define queryFn first for reuse
const getReservationQueryFn = createSSRSafeQuery(async (reservationKey) => {
  if (!reservationKey) throw new Error('Reservation key is required');
  
  const response = await fetch(`/api/contract/reservation/getReservation?reservationKey=${reservationKey}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  
  // Handle 200 responses (including "not found" cases)
  if (response.ok) {
    const data = await response.json();
    devLog.log('🔍 useReservationSSO:', reservationKey, data);
    return data;
  }
  
  // Only throw for actual server errors (500, etc.)
  throw new Error(`Failed to fetch reservation ${reservationKey}: ${response.status}`);
}, null); // Return null during SSR

/**
 * Hook for /api/contract/reservation/getReservation endpoint (SSO users)
 * Gets specific reservation data by reservation key via API + Ethers
 * @param {string} reservationKey - Reservation key to fetch
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with reservation data
 */
export const useReservationSSO = (reservationKey, options = {}) => {
  return useQuery({
    queryKey: bookingQueryKeys.byReservationKey(reservationKey),
    queryFn: () => getReservationQueryFn(reservationKey),
    enabled: !!reservationKey,
    ...BOOKING_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks
useReservationSSO.queryFn = getReservationQueryFn;

/**
 * Hook for reservation reads in the institutional runtime.
 * @param {string} reservationKey - Reservation key to fetch
 * @param {Object} [options={}] - Additional query options
 * @returns {Object} React Query result with reservation data
 */
export const useReservation = (reservationKey, options = {}) => {
  return useReservationSSO(reservationKey, {
    ...options,
    enabled: !!reservationKey && options.enabled !== false,
  });
};

// ===== useReservationsOfToken Hook Family =====

// Define queryFn first for reuse
const getReservationsOfTokenQueryFn = createSSRSafeQuery(async (labId) => {
  if (!labId) throw new Error('Lab ID is required');
  
  const response = await fetch(`/api/contract/reservation/getReservationsOfToken?labId=${labId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch reservations for lab ${labId}: ${response.status}`);
  }
  
  const data = await response.json();
  devLog.log('🔍 useReservationsOfTokenSSO:', labId, data);
  return data;
}, []); // Return empty array during SSR

/**
 * Hook for /api/contract/reservation/getReservationsOfToken endpoint (SSO users)
 * Gets all reservations for a specific lab token via API + Ethers
 * @param {string|number} labId - Lab ID to get reservations for
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with lab reservations
 */
export const useReservationsOfTokenSSO = (labId, options = {}) => {
  return useQuery({
    queryKey: bookingQueryKeys.getReservationsOfToken(labId),
    queryFn: () => getReservationsOfTokenQueryFn(labId),
    enabled: !!labId,
    ...BOOKING_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks
useReservationsOfTokenSSO.queryFn = getReservationsOfTokenQueryFn;

/**
 * Hook for lab reservation reads in the institutional runtime.
 * @param {string|number} labId - Lab ID to get reservations for
 * @param {Object} [options={}] - Additional query options
 * @returns {Object} React Query result with lab reservations
 */
export const useReservationsOfToken = (labId, options = {}) => {
  return useReservationsOfTokenSSO(labId, {
    ...options,
    enabled: !!labId && options.enabled !== false,
  });
};

// ===== useReservationOfTokenByIndex Hook Family =====

// Define queryFn first for reuse
const getReservationOfTokenByIndexQueryFn = createSSRSafeQuery(async (labId, index) => {
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
  devLog.log('🔍 useReservationOfTokenByIndexSSO:', labId, index, data);
  return data;
}, null); // Return null during SSR 

/**
 * Hook for /api/contract/reservation/getReservationOfTokenByIndex endpoint (SSO users)
 * Gets reservation at specific index for a lab token via API + Ethers
 * @param {string|number} labId - Lab ID
 * @param {number} index - Index of the reservation
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with reservation data
 */
export const useReservationOfTokenByIndexSSO = (labId, index, options = {}) => {
  return useQuery({
    queryKey: bookingQueryKeys.getReservationOfTokenByIndex(labId, index),
    queryFn: () => getReservationOfTokenByIndexQueryFn(labId, index),
    enabled: !!labId && (index !== undefined && index !== null),
    ...BOOKING_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks
useReservationOfTokenByIndexSSO.queryFn = getReservationOfTokenByIndexQueryFn;

/**
 * Hook for reservation-by-index reads in the institutional runtime.
 * @param {string|number} labId - Lab ID
 * @param {number} index - Index of the reservation
 * @param {Object} [options={}] - Additional query options
 * @returns {Object} React Query result with reservation data
 */
export const useReservationOfTokenByIndex = (labId, index, options = {}) => {
  const enabled = !!labId && (index !== undefined && index !== null);
  return useReservationOfTokenByIndexSSO(labId, index, {
    ...options,
    enabled: enabled && (options.enabled ?? true),
  });
};

// ===== useReservationsOf Hook Family =====

// Institutional (SSO) - PUC-based count
const getReservationsOfSSOQueryFn = createSSRSafeQuery(async () => {
  const response = await fetch('/api/contract/institution/getUserReservationCount', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch institutional user reservation count: ${response.status}`);
  }
  
  const data = await response.json();
  devLog.log('🔍 useReservationsOfSSO (PUC-based):', data);
  return data;
}, { count: 0 });

/**
 * Hook for institutional reservationsOf (SSO users, PUC-based)
 * Retrieves reservation count for the current SSO user (no wallet address)
 */
export const useReservationsOfSSO = (options = {}) => {
  return useQuery({
    queryKey: bookingQueryKeys.ssoReservationsOf(),
    queryFn: () => getReservationsOfSSOQueryFn(),
    ...BOOKING_QUERY_CONFIG,
    ...options,
  });
};

useReservationsOfSSO.queryFn = getReservationsOfSSOQueryFn;

/**
 * Hook for reservation-count reads in the institutional runtime.
 * @param {string|null} userAddress - User address (null for institutional users)
 * @param {Object} [options={}] - Additional query options
 * @returns {Object} React Query result with user reservations
 */
export const useReservationsOf = (userAddress, options = {}) => {
  return useReservationsOfSSO({
    ...options,
    enabled: options.enabled ?? true,
  });
};

// ===== useReservationKeyOfUserByIndex Hook Family =====

// Define queryFn first for reuse
// PUC-based reservation key lookup (SSO)
const getReservationKeyOfUserByIndexSSOQueryFn = createSSRSafeQuery(async (index) => {
  if (index === undefined || index === null) {
    throw new Error('Index is required');
  }
  const response = await fetch(`/api/contract/institution/getUserReservationByIndex?index=${index}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch institutional reservation at index ${index}: ${response.status}`);
  }
  const data = await response.json();
  devLog.log('🔍 useReservationKeyOfUserByIndexSSO (PUC-based):', index, data);
  return data;
}, { reservationKey: null });

export const useReservationKeyOfUserByIndexSSO = (index, options = {}) => {
  return useQuery({
    queryKey: bookingQueryKeys.ssoReservationKeyOfUserByIndex(index),
    queryFn: () => getReservationKeyOfUserByIndexSSOQueryFn(index),
    enabled: index !== undefined && index !== null,
    ...BOOKING_QUERY_CONFIG,
    ...options,
  });
};

useReservationKeyOfUserByIndexSSO.queryFn = getReservationKeyOfUserByIndexSSOQueryFn;

/**
 * Hook for reservation-key-by-index reads in the institutional runtime.
 * @param {string|null} userAddress - User address (null for institutional users)
 * @param {number} index - User's reservation index
 * @param {Object} [options={}] - Additional query options
 * @returns {Object} React Query result with reservation key
*/
export const useReservationKeyOfUserByIndex = (userAddress, index, options = {}) => {
  const indexValid = index !== undefined && index !== null;
  return useReservationKeyOfUserByIndexSSO(index, {
    ...options,
    enabled: indexValid && (options.enabled ?? true),
  });
};

// ===== useReservationsOfTokenByUser Hook Family =====

const getReservationsOfTokenByUserQueryFn = createSSRSafeQuery(async (labId, userAddress, offset = 0, limit = 50) => {
  if (!labId || !userAddress) {
    throw new Error('labId and userAddress are required');
  }

  const response = await fetch(`/api/contract/reservation/getReservationsOfTokenByUser?labId=${labId}&userAddress=${userAddress}&offset=${offset}&limit=${limit}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch reservations of token by user: ${response.status}`);
  }

  const data = await response.json();
  devLog.log('🔍 useReservationsOfTokenByUserSSO:', labId, userAddress, data);
  return data;
}, { keys: [], total: 0 });

export const useReservationsOfTokenByUserSSO = (labId, userAddress, options = {}) => {
  const offset = options.offset ?? 0;
  const limit = options.limit ?? 50;
  return useQuery({
    queryKey: bookingQueryKeys.getReservationsOfTokenByUser(labId, userAddress, offset, limit),
    queryFn: () => getReservationsOfTokenByUserQueryFn(labId, userAddress, offset, limit),
    enabled: !!labId && !!userAddress && (options.enabled ?? true),
    ...BOOKING_QUERY_CONFIG,
    ...options,
  });
};

useReservationsOfTokenByUserSSO.queryFn = getReservationsOfTokenByUserQueryFn;

export const useReservationsOfTokenByUser = (labId, userAddress, options = {}) => {
  const enabled = !!labId && !!userAddress && (options.enabled ?? true);
  return useReservationsOfTokenByUserSSO(labId, userAddress, {
    ...options,
    enabled,
  });
};

// ===== useUserOfReservation Hook Family =====

// Define queryFn first for reuse
const getUserOfReservationQueryFn = createSSRSafeQuery(async (reservationKey) => {
  if (!reservationKey) throw new Error('Reservation key is required');
  
  const response = await fetch(`/api/contract/reservation/userOfReservation?reservationKey=${encodeURIComponent(reservationKey)}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch user for reservation ${reservationKey}: ${response.status}`);
  }
  
  const data = await response.json();
  devLog.log('🔍 useUserOfReservationSSO:', reservationKey, data);
  return data;
}, { user: null }); // Return null during SSR

/**
 * Hook for /api/contract/reservation/userOfReservation endpoint (SSO users)
 * Gets the user address that made a specific reservation via API + Ethers
 * @param {string} reservationKey - Reservation key
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with user address
 */
export const useUserOfReservationSSO = (reservationKey, options = {}) => {
  return useQuery({
    queryKey: bookingQueryKeys.userOfReservation(reservationKey),
    queryFn: () => getUserOfReservationQueryFn(reservationKey),
    enabled: !!reservationKey,
    ...BOOKING_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks
useUserOfReservationSSO.queryFn = getUserOfReservationQueryFn;

/**
 * Hook for reservation-owner reads in the institutional runtime.
 * @param {string} reservationKey - Reservation key
 * @param {Object} [options={}] - Additional query options
 * @returns {Object} React Query result with user address
 */
export const useUserOfReservation = (reservationKey, options = {}) => {
  return useUserOfReservationSSO(reservationKey, {
    ...options,
    enabled: !!reservationKey && (options.enabled ?? true),
  });
};

// ===== useCheckAvailable Hook Family =====

// Define queryFn first for reuse
const getCheckAvailableQueryFn = createSSRSafeQuery(async (labId, start, duration) => {
  if (!labId || !start || !duration) {
    throw new Error('Lab ID, start time, and duration are required');
  }
  
  const end = parseInt(start) + parseInt(duration);
  const response = await fetch(`/api/contract/reservation/checkAvailable?labId=${encodeURIComponent(labId)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
  
  if (!response.ok) {
    throw new Error(`Failed to check availability for lab ${labId}: ${response.status}`);
  }
  
  const data = await response.json();
  devLog.log('🔍 useCheckAvailableSSO:', labId, start, duration, data);
  return data;
}, { available: false }); // Return false during SSR

/**
 * Hook for /api/contract/reservation/checkAvailable endpoint (SSO users)
 * Checks if a lab is available for booking at specified time via API + Ethers
 * @param {string|number} labId - Lab ID
 * @param {number} start - Start timestamp
 * @param {number} duration - Duration in seconds
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with availability status
 */
export const useCheckAvailableSSO = (labId, start, duration, options = {}) => {
  return useQuery({
    queryKey: bookingQueryKeys.checkAvailable(labId, start, duration),
    queryFn: () => getCheckAvailableQueryFn(labId, start, duration),
    enabled: !!(labId && start && duration),
    ...BOOKING_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks
useCheckAvailableSSO.queryFn = getCheckAvailableQueryFn;

/**
 * Hook for availability checks in the institutional runtime.
 * @param {string|number} labId - Lab ID
 * @param {number} start - Start timestamp
 * @param {number} duration - Duration in seconds
 * @param {Object} [options={}] - Additional query options
 * @returns {Object} React Query result with availability status
 */
export const useCheckAvailable = (labId, start, duration, options = {}) => {
  const enabled = !!(labId && start && duration);
  return useCheckAvailableSSO(labId, start, duration, {
    ...options,
    enabled: enabled && (options.enabled ?? true),
  });
};

// ===== useHasActiveBooking Hook Family =====

// Define queryFn first for reuse
const getHasActiveBookingQueryFn = createSSRSafeQuery(async (reservationKey, userAddress) => {
  if (!reservationKey || !userAddress) throw new Error('Reservation key and user address are required');
  
  const response = await fetch(
    `/api/contract/reservation/hasActiveBooking?reservationKey=${encodeURIComponent(reservationKey)}&userAddress=${encodeURIComponent(userAddress)}`,
    {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    },
  );
  
  if (!response.ok) {
    throw new Error(`Failed to check active booking for reservation ${reservationKey}: ${response.status}`);
  }
  
  const data = await response.json();
  devLog.log('?? useHasActiveBookingSSO:', reservationKey, userAddress, data);
  return data;
}, { hasActiveBooking: false }); // Return false during SSR

/**
 * Hook for /api/contract/reservation/hasActiveBooking endpoint (SSO users)
 * Checks if a reservation is active for a specific user via API + Ethers
 * @param {string} reservationKey - Reservation key (bytes32)
 * @param {string} userAddress - User address to check
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with active booking status
 */
export const useHasActiveBookingSSO = (reservationKey, userAddress, options = {}) => {
  return useQuery({
    queryKey: bookingQueryKeys.hasActiveBooking(reservationKey, userAddress),
    queryFn: () => getHasActiveBookingQueryFn(reservationKey, userAddress),
    enabled: !!reservationKey && !!userAddress,
    ...BOOKING_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks
useHasActiveBookingSSO.queryFn = getHasActiveBookingQueryFn;

/**
 * Hook for active-booking checks in the institutional runtime.
 * @param {string} reservationKey - Reservation key (bytes32)
 * @param {string} userAddress - User address to check
 * @param {Object} [options={}] - Additional query options
 * @returns {Object} React Query result with active booking status
 */
export const useHasActiveBooking = (reservationKey, userAddress, options = {}) => {
  const enabled = !!reservationKey && !!userAddress;
  return useHasActiveBookingSSO(reservationKey, userAddress, {
    ...options,
    enabled: enabled && (options.enabled ?? true),
  });
};
// ===== SSO session: useActiveReservationKey Hook (SSO-only) =====

const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';

// Define queryFn first for reuse
const getSSOActiveReservationKeyQueryFn = createSSRSafeQuery(async (labId) => {
  if (!labId) {
    throw new Error('Lab ID is required')
  }

  const url = `/api/contract/institution/getActiveReservationKey?labId=${encodeURIComponent(labId)}`
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch SSO active reservation key: ${response.status}`)
  }

  const data = await response.json()
  devLog.log('🔍 useActiveReservationKeyForSessionUserSSO:', labId, data)
  return data
}, { reservationKey: ZERO_BYTES32, hasActiveReservation: false })

/**
 * Hook for /api/contract/institution/getActiveReservationKey (SSO institutional users)
 * Gets active reservation key for institutional user by labId
 */
export const useActiveReservationKeyForSessionUserSSO = (labId, options = {}) => {
  return useQuery({
    queryKey: bookingQueryKeys.ssoActiveReservationKeySession(labId),
    queryFn: () => getSSOActiveReservationKeyQueryFn(labId),
    enabled: !!labId,
    ...BOOKING_QUERY_CONFIG,
    ...options,
  })
}

useActiveReservationKeyForSessionUserSSO.queryFn = getSSOActiveReservationKeyQueryFn;

// ===== SSO session: useHasActiveBooking Hook (SSO-only) =====

// Define queryFn first for reuse
const getSSOHasActiveBookingQueryFn = createSSRSafeQuery(async () => {
  const response = await fetch('/api/contract/institution/hasUserActiveBooking', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`Failed to check SSO active booking: ${response.status}`)
  }

  const data = await response.json()
  devLog.log('🔍 useHasActiveBookingForSessionUserSSO:', data)
  return data
}, { hasActiveBooking: false })

/**
 * Hook for /api/contract/institution/hasUserActiveBooking (SSO institutional users)
 * Checks if institutional user has any active booking
 */
export const useHasActiveBookingForSessionUserSSO = (options = {}) => {
  return useQuery({
    queryKey: bookingQueryKeys.ssoHasActiveBookingSession(),
    queryFn: () => getSSOHasActiveBookingQueryFn(),
    enabled: options.enabled ?? true,
    ...BOOKING_QUERY_CONFIG,
    ...options,
  })
}

useHasActiveBookingForSessionUserSSO.queryFn = getSSOHasActiveBookingQueryFn;

// Session-friendly wrappers for the institutional runtime.
export const useActiveReservationKeyForSessionUser = (labId, options = {}) => {
  return useActiveReservationKeyForSessionUserSSO(labId, {
    ...options,
    enabled: !!labId && (options.enabled ?? true),
  })
}

export const useHasActiveBookingForSessionUser = (options = {}) => {
  return useHasActiveBookingForSessionUserSSO({
    ...options,
    enabled: options.enabled ?? true,
  })
}

// ===== useLabCreditAddress Hook Family =====

// Define queryFn first for reuse
const getLabCreditAddressQueryFn = createSSRSafeQuery(async () => {
  const response = await fetch('/api/contract/reservation/getLabCreditAddress', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch service-credit ledger address: ${response.status}`);
  }
  
  const data = await response.json();
  devLog.log('🔍 useLabCreditAddressSSO:', data);
  return data;
}, { labCreditAddress: null }); // Return null during SSR

/**
 * Hook for /api/contract/reservation/getLabCreditAddress endpoint (SSO users)
 * Gets the service-credit ledger address via API
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with ledger address
 */
export const useLabCreditAddressSSO = (options = {}) => {
  return useQuery({
    queryKey: bookingQueryKeys.labCreditAddress(),
    queryFn: () => getLabCreditAddressQueryFn(),
    ...BOOKING_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks
useLabCreditAddressSSO.queryFn = getLabCreditAddressQueryFn;

/**
 * Hook for service-credit-ledger-address reads in the institutional runtime.
 * @param {Object} [options={}] - Additional query options
 * @returns {Object} React Query result with ledger address
 */
export const useLabCreditAddress = (options = {}) => {
  return useLabCreditAddressSSO(options);
};
