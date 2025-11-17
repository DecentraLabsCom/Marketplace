/**
 * Atomic React Query Hooks for Booking-related Read Operations
 * Each hook has 3 variants following the same pattern as mutations:
 * - useXSSO: Server-side query via API + Ethers (for SSO users)
 *   * Each hook maps 1:1 to a specific API endpoint in /api/contract/reservation
 * - useXWallet: Client-side query via Wagmi (for wallet users)
 * - useX: Router that selects SSO or Wallet based on user.loginType
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
import { useGetIsSSO } from '@/utils/hooks/getIsSSO'
import useDefaultReadContract from '@/hooks/contract/useDefaultReadContract'
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
 * Hook for getReservation contract read (Wallet users)
 * Gets specific reservation data directly from blockchain via Wagmi
 * @param {string} reservationKey - Reservation key to fetch
 * @param {Object} [options={}] - Additional wagmi options
 * @returns {Object} Wagmi query result with reservation data normalized to match SSO structure
 */
export const useReservationWallet = (reservationKey, options = {}) => {
  const result = useDefaultReadContract('getReservation', [reservationKey], {
      enabled: !!reservationKey,
      ...BOOKING_QUERY_CONFIG,
      ...options,
    });
  
  // Normalize the data after it's fetched
  return {
    ...result,
    data: result.data ? (() => {
      const data = result.data;
      
      // Contract returns: { labId, renter, price, start, end, status }
      const status = Number(data.status);
      const renterAddress = data.renter || '0x0000000000000000000000000000000000000000';
      const exists = renterAddress !== '0x0000000000000000000000000000000000000000';

      // Determine reservation state (matching SSO logic)
      let reservationState = 'Unknown';
      let isConfirmed = false;
      
      if (!exists) {
        reservationState = 'Not Found';
      } else {
        switch (status) {
          case 0:
            reservationState = 'Pending';
            isConfirmed = false;
            break;
          case 1:
            reservationState = 'Booked/Confirmed';
            isConfirmed = true;
            break;
          case 2:
            reservationState = 'Used';
            isConfirmed = true;
            break;
          case 3:
            reservationState = 'Collected';
            isConfirmed = true;
            break;
          case 4:
            reservationState = 'Cancelled';
            isConfirmed = false;
            break;
          default:
            reservationState = 'Unknown Status';
        }
      }

      return {
        reservation: {
          labId: data.labId?.toString() || null,
          renter: renterAddress,
          price: data.price?.toString() || null,
          start: data.start?.toString() || null,
          end: data.end?.toString() || null,
          status: status,
          reservationState: reservationState,
          isPending: status === 0,
          isBooked: status === 1,
          isUsed: status === 2,
          isCollected: status === 3,
          isCanceled: status === 4,
          isActive: status === 1,
          isCompleted: status === 2 || status === 3,
          isConfirmed: isConfirmed,
          exists: exists
        },
        reservationKey
      };
    })() : null
  };
};

/**
 * Hook for getReservation (Router - selects SSO or Wallet)
 * Gets specific reservation data - routes to API or Wagmi based on user type
 * @param {string} reservationKey - Reservation key to fetch
 * @param {Object} [options={}] - Additional query options
 * @param {boolean} [options.isSSO] - Optional: force SSO or Wallet mode (for use outside UserContext)
 * @returns {Object} React Query result with reservation data
 */
export const useReservation = (reservationKey, options = {}) => {
  const isSSO = useGetIsSSO(options);
  
  const ssoQuery = useReservationSSO(reservationKey, { ...options, enabled: isSSO && !!reservationKey });
  const walletQuery = useReservationWallet(reservationKey, { ...options, enabled: !isSSO && !!reservationKey });
  
  devLog.log(`🔀 useReservation [${reservationKey}] → ${isSSO ? 'SSO' : 'Wallet'} mode`);
  
  return isSSO ? ssoQuery : walletQuery;
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
 * Hook for getReservationsOfToken contract read (Wallet users)
 * Gets all reservations for a specific lab token directly from blockchain via Wagmi
 * @param {string|number} labId - Lab ID to get reservations for
 * @param {Object} [options={}] - Additional wagmi options
 * @returns {Object} Wagmi query result with lab reservations
 */
export const useReservationsOfTokenWallet = (labId, options = {}) => {
  return useDefaultReadContract('getReservationsOfToken', [labId], {
      enabled: !!labId,
      ...BOOKING_QUERY_CONFIG,
      ...options,
    });
};

/**
 * Hook for getReservationsOfToken (Router - selects SSO or Wallet)
 * Gets all reservations for a specific lab token - routes to API or Wagmi based on user type
 * @param {string|number} labId - Lab ID to get reservations for
 * @param {Object} [options={}] - Additional query options
 * @param {boolean} [options.isSSO] - Optional: force SSO or Wallet mode (for use outside UserContext)
 * @returns {Object} React Query result with lab reservations
 */
export const useReservationsOfToken = (labId, options = {}) => {
  const isSSO = useGetIsSSO(options);
  
  const ssoQuery = useReservationsOfTokenSSO(labId, { ...options, enabled: isSSO && !!labId });
  const walletQuery = useReservationsOfTokenWallet(labId, { ...options, enabled: !isSSO && !!labId });
  
  devLog.log(`🔀 useReservationsOfToken [${labId}] → ${isSSO ? 'SSO' : 'Wallet'} mode`);
  
  return isSSO ? ssoQuery : walletQuery;
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
 * Hook for getReservationOfTokenByIndex contract read (Wallet users)
 * Gets reservation at specific index for a lab token directly from blockchain via Wagmi
 * @param {string|number} labId - Lab ID
 * @param {number} index - Index of the reservation
 * @param {Object} [options={}] - Additional wagmi options
 * @returns {Object} Wagmi query result with reservation data
 */
export const useReservationOfTokenByIndexWallet = (labId, index, options = {}) => {
  return useDefaultReadContract('getReservationOfTokenByIndex', [labId, index], {
      enabled: !!labId && (index !== undefined && index !== null),
      ...BOOKING_QUERY_CONFIG,
      ...options,
    });
};

/**
 * Hook for getReservationOfTokenByIndex (Router - selects SSO or Wallet)
 * Gets reservation at specific index for a lab token - routes to API or Wagmi based on user type
 * @param {string|number} labId - Lab ID
 * @param {number} index - Index of the reservation
 * @param {Object} [options={}] - Additional query options
 * @param {boolean} [options.isSSO] - Optional: force SSO or Wallet mode (for use outside UserContext)
 * @returns {Object} React Query result with reservation data
 */
export const useReservationOfTokenByIndex = (labId, index, options = {}) => {
  const isSSO = useGetIsSSO(options);
  
  const enabled = !!labId && (index !== undefined && index !== null);
  const ssoQuery = useReservationOfTokenByIndexSSO(labId, index, { ...options, enabled: isSSO && enabled });
  const walletQuery = useReservationOfTokenByIndexWallet(labId, index, { ...options, enabled: !isSSO && enabled });
  
  devLog.log(`🔀 useReservationOfTokenByIndex [${labId}, ${index}] → ${isSSO ? 'SSO' : 'Wallet'} mode`);
  
  return isSSO ? ssoQuery : walletQuery;
};

// ===== useReservationsOf Hook Family =====

// Define queryFn first for reuse
const getReservationsOfQueryFn = createSSRSafeQuery(async (userAddress) => {
  if (!userAddress) throw new Error('User address is required');
  
  const response = await fetch(`/api/contract/reservation/reservationsOf?userAddress=${userAddress}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch reservations for user ${userAddress}: ${response.status}`);
  }
  
  const data = await response.json();
  devLog.log('🔍 useReservationsOfSSO:', userAddress, data);
  return data;
}, { count: 0 }); // Return count object during SSR

/**
 * Hook for /api/contract/reservation/reservationsOf endpoint (SSO users)
 * Gets all reservations made by a specific user via API + Ethers
 * @param {string} userAddress - User address to get reservations for
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with user reservations
 */
export const useReservationsOfSSO = (userAddress, options = {}) => {
  return useQuery({
    queryKey: bookingQueryKeys.reservationsOf(userAddress),
    queryFn: () => getReservationsOfQueryFn(userAddress),
    enabled: !!userAddress,
    ...BOOKING_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks
useReservationsOfSSO.queryFn = getReservationsOfQueryFn;

/**
 * Hook for reservationsOf contract read (Wallet users)
 * Gets all reservations made by a specific user directly from blockchain via Wagmi
 * @param {string} userAddress - User address to get reservations for
 * @param {Object} [options={}] - Additional wagmi options
 * @returns {Object} Wagmi query result with user reservations (normalized format)
 */
export const useReservationsOfWallet = (userAddress, options = {}) => {
  const result = useDefaultReadContract('reservationsOf', [userAddress], {
      enabled: !!userAddress,
      ...BOOKING_QUERY_CONFIG,
      ...options,
    });
  
  // Transform Wagmi data to match SSO format
  const transformedData = result.data !== undefined ? {
    count: typeof result.data === 'bigint' ? Number(result.data) : result.data
  } : undefined;
  
  return {
    ...result,
    data: transformedData
  };
};

/**
 * Hook for reservationsOf (Router - selects SSO or Wallet)
 * Gets all reservations made by a specific user - routes to API or Wagmi based on user type
 * @param {string} userAddress - User address to get reservations for
 * @param {Object} [options={}] - Additional query options
 * @param {boolean} [options.isSSO] - Optional: force SSO or Wallet mode (for use outside UserContext)
 * @returns {Object} React Query result with user reservations
 */
export const useReservationsOf = (userAddress, options = {}) => {
  const isSSO = useGetIsSSO(options);
  
  const ssoQuery = useReservationsOfSSO(userAddress, { ...options, enabled: isSSO && !!userAddress });
  const walletQuery = useReservationsOfWallet(userAddress, { ...options, enabled: !isSSO && !!userAddress });
  
  devLog.log(`🔀 useReservationsOf [${userAddress}] → ${isSSO ? 'SSO' : 'Wallet'} mode`);
  
  return isSSO ? ssoQuery : walletQuery;
};

// ===== useReservationKeyByIndex Hook Family =====

// Define queryFn first for reuse
const getReservationKeyByIndexQueryFn = createSSRSafeQuery(async (index) => {
  if (index === undefined || index === null) {
    throw new Error('Index is required');
  }
  
  const response = await fetch(`/api/contract/reservation/reservationKeyByIndex?index=${encodeURIComponent(index)}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch reservation key at index ${index}: ${response.status}`);
  }
  
  const data = await response.json();
  devLog.log('🔍 useReservationKeyByIndexSSO:', index, data);
  return data;
}, { reservationKey: null }); // Return null during SSR

/**
 * Hook for /api/contract/reservation/reservationKeyByIndex endpoint (SSO users)
 * Gets reservation key at specific global index via API + Ethers
 * @param {number} index - Global index of the reservation
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with reservation key
 */
export const useReservationKeyByIndexSSO = (index, options = {}) => {
  return useQuery({
    queryKey: bookingQueryKeys.reservationKeyByIndex(index),
    queryFn: () => getReservationKeyByIndexQueryFn(index),
    enabled: (index !== undefined && index !== null),
    ...BOOKING_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks
useReservationKeyByIndexSSO.queryFn = getReservationKeyByIndexQueryFn;

/**
 * Hook for reservationKeyByIndex contract read (Wallet users)
 * Gets reservation key at specific global index directly from blockchain via Wagmi
 * @param {number} index - Global index of the reservation
 * @param {Object} [options={}] - Additional wagmi options
 * @returns {Object} Wagmi query result with reservation key
 */
export const useReservationKeyByIndexWallet = (index, options = {}) => {
  return useDefaultReadContract('reservationKeyByIndex', [index], {
      enabled: (index !== undefined && index !== null),
      ...BOOKING_QUERY_CONFIG,
      ...options,
    });
};

/**
 * Hook for reservationKeyByIndex (Router - selects SSO or Wallet)
 * Gets reservation key at specific global index - routes to API or Wagmi based on user type
 * @param {number} index - Global index of the reservation
 * @param {Object} [options={}] - Additional query options
 * @param {boolean} [options.isSSO] - Optional: force SSO or Wallet mode (for use outside UserContext)
 * @returns {Object} React Query result with reservation key
 */
export const useReservationKeyByIndex = (index, options = {}) => {
  const isSSO = useGetIsSSO(options);
  
  const enabled = (index !== undefined && index !== null);
  const ssoQuery = useReservationKeyByIndexSSO(index, { ...options, enabled: isSSO && enabled });
  const walletQuery = useReservationKeyByIndexWallet(index, { ...options, enabled: !isSSO && enabled });
  
  devLog.log(`🔀 useReservationKeyByIndex [${index}] → ${isSSO ? 'SSO' : 'Wallet'} mode`);
  
  return isSSO ? ssoQuery : walletQuery;
};

// ===== useReservationKeyOfUserByIndex Hook Family =====

// Define queryFn first for reuse
const getReservationKeyOfUserByIndexQueryFn = createSSRSafeQuery(async (userAddress, index) => {
  if (!userAddress || index === undefined || index === null) {
    throw new Error('User address and index are required');
  }
  
  const response = await fetch(`/api/contract/reservation/reservationKeyOfUserByIndex?userAddress=${userAddress}&index=${index}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch reservation key at index ${index} for user ${userAddress}: ${response.status}`);
  }
  
  const data = await response.json();
  devLog.log('🔍 useReservationKeyOfUserByIndexSSO:', userAddress, index, data);
  return data;
}, { reservationKey: null }); // Return null during SSR

/**
 * Hook for /api/contract/reservation/reservationKeyOfUserByIndex endpoint (SSO users)
 * Gets reservation key at specific index for a user via API + Ethers
 * @param {string} userAddress - User address
 * @param {number} index - User's reservation index
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with reservation key
 */
export const useReservationKeyOfUserByIndexSSO = (userAddress, index, options = {}) => {
  return useQuery({
    queryKey: bookingQueryKeys.reservationKeyOfUserByIndex(userAddress, index),
    queryFn: () => getReservationKeyOfUserByIndexQueryFn(userAddress, index),
    enabled: !!userAddress && (index !== undefined && index !== null),
    ...BOOKING_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks
useReservationKeyOfUserByIndexSSO.queryFn = getReservationKeyOfUserByIndexQueryFn;

/**
 * Hook for reservationKeyOfUserByIndex contract read (Wallet users)
 * Gets reservation key at specific index for a user directly from blockchain via Wagmi
 * @param {string} userAddress - User address
 * @param {number} index - User's reservation index
 * @param {Object} [options={}] - Additional wagmi options
 * @returns {Object} Wagmi query result with reservation key (normalized format)
 */
export const useReservationKeyOfUserByIndexWallet = (userAddress, index, options = {}) => {
  const result = useDefaultReadContract('reservationKeyOfUserByIndex', [userAddress, index], {
      enabled: !!userAddress && (index !== undefined && index !== null),
      ...BOOKING_QUERY_CONFIG,
      ...options,
    });
  
  // Transform Wagmi data to match SSO format
  const transformedData = result.data !== undefined ? {
    reservationKey: result.data // Wagmi returns the key directly
  } : undefined;
  
  return {
    ...result,
    data: transformedData
  };
};

/**
 * Hook for reservationKeyOfUserByIndex (Router - selects SSO or Wallet)
 * Gets reservation key at specific index for a user - routes to API or Wagmi based on user type
 * @param {string} userAddress - User address
 * @param {number} index - User's reservation index
 * @param {Object} [options={}] - Additional query options
 * @param {boolean} [options.isSSO] - Optional: force SSO or Wallet mode (for use outside UserContext)
 * @returns {Object} React Query result with reservation key
 */
export const useReservationKeyOfUserByIndex = (userAddress, index, options = {}) => {
  const isSSO = useGetIsSSO(options);
  
  const enabled = !!userAddress && (index !== undefined && index !== null);
  const ssoQuery = useReservationKeyOfUserByIndexSSO(userAddress, index, { ...options, enabled: isSSO && enabled });
  const walletQuery = useReservationKeyOfUserByIndexWallet(userAddress, index, { ...options, enabled: !isSSO && enabled });
  
  devLog.log(`🔀 useReservationKeyOfUserByIndex [${userAddress}, ${index}] → ${isSSO ? 'SSO' : 'Wallet'} mode`);
  
  return isSSO ? ssoQuery : walletQuery;
};

// ===== useTotalReservations Hook Family =====

// Define queryFn first for reuse
const getTotalReservationsQueryFn = createSSRSafeQuery(async () => {
  const response = await fetch('/api/contract/reservation/totalReservations', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch total reservations: ${response.status}`);
  }
  
  const data = await response.json();
  devLog.log('🔍 useTotalReservationsSSO:', data);
  return data;
}, { total: '0' }); // Return '0' during SSR

/**
 * Hook for /api/contract/reservation/totalReservations endpoint (SSO users)
 * Gets the total count of all reservations via API + Ethers
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with total count
 */
export const useTotalReservationsSSO = (options = {}) => {
  return useQuery({
    queryKey: bookingQueryKeys.totalReservations(),
    queryFn: () => getTotalReservationsQueryFn(),
    ...BOOKING_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks
useTotalReservationsSSO.queryFn = getTotalReservationsQueryFn;

/**
 * Hook for totalReservations contract read (Wallet users)
 * Gets the total count of all reservations directly from blockchain via Wagmi
 * @param {Object} [options={}] - Additional wagmi options
 * @returns {Object} Wagmi query result with total count
 */
export const useTotalReservationsWallet = (options = {}) => {
  return useDefaultReadContract('totalReservations', [], {
      ...BOOKING_QUERY_CONFIG,
      ...options,
    });
};

/**
 * Hook for totalReservations (Router - selects SSO or Wallet)
 * Gets the total count of all reservations - routes to API or Wagmi based on user type
 * @param {Object} [options={}] - Additional query options
 * @param {boolean} [options.isSSO] - Optional: force SSO or Wallet mode (for use outside UserContext)
 * @returns {Object} React Query result with total count
 */
export const useTotalReservations = (options = {}) => {
  const isSSO = useGetIsSSO(options);
  
  const ssoQuery = useTotalReservationsSSO({ ...options, enabled: isSSO });
  const walletQuery = useTotalReservationsWallet({ ...options, enabled: !isSSO });
  
  devLog.log(`🔀 useTotalReservations → ${isSSO ? 'SSO' : 'Wallet'} mode`);
  
  return isSSO ? ssoQuery : walletQuery;
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
 * Hook for userOfReservation contract read (Wallet users)
 * Gets the user address that made a specific reservation directly from blockchain via Wagmi
 * @param {string} reservationKey - Reservation key
 * @param {Object} [options={}] - Additional wagmi options
 * @returns {Object} Wagmi query result with user address
 */
export const useUserOfReservationWallet = (reservationKey, options = {}) => {
  return useDefaultReadContract('userOfReservation', [reservationKey], {
      enabled: !!reservationKey,
      ...BOOKING_QUERY_CONFIG,
      ...options,
    });
};

/**
 * Hook for userOfReservation (Router - selects SSO or Wallet)
 * Gets the user address that made a specific reservation - routes to API or Wagmi based on user type
 * @param {string} reservationKey - Reservation key
 * @param {Object} [options={}] - Additional query options
 * @param {boolean} [options.isSSO] - Optional: force SSO or Wallet mode (for use outside UserContext)
 * @returns {Object} React Query result with user address
 */
export const useUserOfReservation = (reservationKey, options = {}) => {
  const isSSO = useGetIsSSO(options);
  
  const ssoQuery = useUserOfReservationSSO(reservationKey, { ...options, enabled: isSSO && !!reservationKey });
  const walletQuery = useUserOfReservationWallet(reservationKey, { ...options, enabled: !isSSO && !!reservationKey });
  
  devLog.log(`🔀 useUserOfReservation [${reservationKey}] → ${isSSO ? 'SSO' : 'Wallet'} mode`);
  
  return isSSO ? ssoQuery : walletQuery;
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
 * Hook for checkAvailable contract read (Wallet users)
 * Checks if a lab is available for booking at specified time directly from blockchain via Wagmi
 * @param {string|number} labId - Lab ID
 * @param {number} start - Start timestamp
 * @param {number} duration - Duration in seconds
 * @param {Object} [options={}] - Additional wagmi options
 * @returns {Object} Wagmi query result with availability status
 */
export const useCheckAvailableWallet = (labId, start, duration, options = {}) => {
  const end = start && duration ? parseInt(start) + parseInt(duration) : undefined;
  
  return useDefaultReadContract('checkAvailable', [labId, start, end], {
      enabled: !!(labId && start && duration),
      ...BOOKING_QUERY_CONFIG,
      ...options,
    });
};

/**
 * Hook for checkAvailable (Router - selects SSO or Wallet)
 * Checks if a lab is available for booking at specified time - routes to API or Wagmi based on user type
 * @param {string|number} labId - Lab ID
 * @param {number} start - Start timestamp
 * @param {number} duration - Duration in seconds
 * @param {Object} [options={}] - Additional query options
 * @param {boolean} [options.isSSO] - Optional: force SSO or Wallet mode (for use outside UserContext)
 * @returns {Object} React Query result with availability status
 */
export const useCheckAvailable = (labId, start, duration, options = {}) => {
  const isSSO = useGetIsSSO(options);
  
  const enabled = !!(labId && start && duration);
  const ssoQuery = useCheckAvailableSSO(labId, start, duration, { ...options, enabled: isSSO && enabled });
  const walletQuery = useCheckAvailableWallet(labId, start, duration, { ...options, enabled: !isSSO && enabled });
  
  devLog.log(`🔀 useCheckAvailable [${labId}, ${start}, ${duration}] → ${isSSO ? 'SSO' : 'Wallet'} mode`);
  
  return isSSO ? ssoQuery : walletQuery;
};

// ===== useHasActiveBooking Hook Family =====

// Define queryFn first for reuse
const getHasActiveBookingQueryFn = createSSRSafeQuery(async (userAddress) => {
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
  devLog.log('🔍 useHasActiveBookingSSO:', userAddress, data);
  return data;
}, { hasActiveBooking: false }); // Return false during SSR

/**
 * Hook for /api/contract/reservation/hasActiveBooking endpoint (SSO users)
 * Checks if a user has any active booking via API + Ethers
 * @param {string} userAddress - User address to check
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with active booking status
 */
export const useHasActiveBookingSSO = (userAddress, options = {}) => {
  return useQuery({
    queryKey: bookingQueryKeys.hasActiveBooking(userAddress),
    queryFn: () => getHasActiveBookingQueryFn(userAddress),
    enabled: !!userAddress,
    ...BOOKING_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks
useHasActiveBookingSSO.queryFn = getHasActiveBookingQueryFn;

/**
 * Hook for hasActiveBooking contract read (Wallet users)
 * Checks if a user has any active booking directly from blockchain via Wagmi
 * @param {string} userAddress - User address to check
 * @param {Object} [options={}] - Additional wagmi options
 * @returns {Object} Wagmi query result with active booking status
 */
export const useHasActiveBookingWallet = (userAddress, options = {}) => {
  return useDefaultReadContract('hasActiveBooking', [userAddress], {
      enabled: !!userAddress,
      ...BOOKING_QUERY_CONFIG,
      ...options,
    });
};

/**
 * Hook for hasActiveBooking (Router - selects SSO or Wallet)
 * Checks if a user has any active booking - routes to API or Wagmi based on user type
 * @param {string} userAddress - User address to check
 * @param {Object} [options={}] - Additional query options
 * @param {boolean} [options.isSSO] - Optional: force SSO or Wallet mode (for use outside UserContext)
 * @returns {Object} React Query result with active booking status
 */
export const useHasActiveBooking = (userAddress, options = {}) => {
  const isSSO = useGetIsSSO(options);
  
  const ssoQuery = useHasActiveBookingSSO(userAddress, { ...options, enabled: isSSO && !!userAddress });
  const walletQuery = useHasActiveBookingWallet(userAddress, { ...options, enabled: !isSSO && !!userAddress });
  
  devLog.log(`🔀 useHasActiveBooking [${userAddress}] → ${isSSO ? 'SSO' : 'Wallet'} mode`);
  
  return isSSO ? ssoQuery : walletQuery;
};

// ===== useHasActiveBookingByToken Hook Family =====

// Define queryFn first for reuse
const getHasActiveBookingByTokenQueryFn = createSSRSafeQuery(async (labId) => {
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
  devLog.log('🔍 useHasActiveBookingByTokenSSO:', labId, data);
  return data;
}, { hasActiveBooking: false }); // Return false during SSR

/**
 * Hook for /api/contract/reservation/hasActiveBookingByToken endpoint (SSO users)
 * Checks if a specific lab token has any active booking via API + Ethers
 * @param {string|number} labId - Lab ID to check
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with active booking status for the lab
 */
export const useHasActiveBookingByTokenSSO = (labId, options = {}) => {
  return useQuery({
    queryKey: bookingQueryKeys.hasActiveBookingByToken(labId),
    queryFn: () => getHasActiveBookingByTokenQueryFn(labId),
    enabled: !!labId,
    ...BOOKING_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks
useHasActiveBookingByTokenSSO.queryFn = getHasActiveBookingByTokenQueryFn;

/**
 * Hook for hasActiveBookingByToken contract read (Wallet users)
 * Checks if a specific lab token has any active booking directly from blockchain via Wagmi
 * @param {string|number} labId - Lab ID to check
 * @param {Object} [options={}] - Additional wagmi options
 * @returns {Object} Wagmi query result with active booking status for the lab
 */
export const useHasActiveBookingByTokenWallet = (labId, options = {}) => {
  return useDefaultReadContract('hasActiveBookingByToken', [labId], {
      enabled: !!labId,
      ...BOOKING_QUERY_CONFIG,
      ...options,
    });
};

/**
 * Hook for hasActiveBookingByToken (Router - selects SSO or Wallet)
 * Checks if a specific lab token has any active booking - routes to API or Wagmi based on user type
 * @param {string|number} labId - Lab ID to check
 * @param {Object} [options={}] - Additional query options
 * @param {boolean} [options.isSSO] - Optional: force SSO or Wallet mode (for use outside UserContext)
 * @returns {Object} React Query result with active booking status for the lab
 */
export const useHasActiveBookingByToken = (labId, options = {}) => {
  const isSSO = useGetIsSSO(options);
  
  const ssoQuery = useHasActiveBookingByTokenSSO(labId, { ...options, enabled: isSSO && !!labId });
  const walletQuery = useHasActiveBookingByTokenWallet(labId, { ...options, enabled: !isSSO && !!labId });
  
  devLog.log(`🔀 useHasActiveBookingByToken [${labId}] → ${isSSO ? 'SSO' : 'Wallet'} mode`);
  
  return isSSO ? ssoQuery : walletQuery;
};

// ===== useActiveReservationKeyForUser Hook Family =====

// Define queryFn first for reuse
const getActiveReservationKeyForUserQueryFn = createSSRSafeQuery(async (labId, userAddress) => {
  if (!labId || !userAddress) {
    throw new Error('Lab ID and user address are required');
  }
  
  const response = await fetch(`/api/contract/reservation/getActiveReservationKeyForUser?labId=${encodeURIComponent(labId)}&userAddress=${encodeURIComponent(userAddress)}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch active reservation key for user ${userAddress} in lab ${labId}: ${response.status}`);
  }
  
  const data = await response.json();
  devLog.log('🔍 useActiveReservationKeyForUserSSO:', labId, userAddress, data);
  return data;
}, { reservationKey: '0x0000000000000000000000000000000000000000000000000000000000000000' }); // Return zero bytes32 during SSR

/**
 * Hook for /api/contract/reservation/getActiveReservationKeyForUser endpoint (SSO users)
 * Gets the active reservation key for a user in a specific lab using O(1) contract lookup via API + Ethers
 * @param {string|number} labId - Lab ID to check
 * @param {string} userAddress - User address to check
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with reservation key (or 0x0 if no active booking)
 */
export const useActiveReservationKeyForUserSSO = (labId, userAddress, options = {}) => {
  return useQuery({
    queryKey: bookingQueryKeys.activeReservationKeyForUser(labId, userAddress),
    queryFn: () => getActiveReservationKeyForUserQueryFn(labId, userAddress),
    enabled: !!labId && !!userAddress,
    ...BOOKING_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks
useActiveReservationKeyForUserSSO.queryFn = getActiveReservationKeyForUserQueryFn;

/**
 * Hook for getActiveReservationKeyForUser contract read (Wallet users)
 * Gets the active reservation key for a user in a specific lab directly from blockchain via Wagmi
 * @param {string|number} labId - Lab ID to check
 * @param {string} userAddress - User address to check
 * @param {Object} [options={}] - Additional wagmi options
 * @returns {Object} Wagmi query result with reservation key (or 0x0 if no active booking)
 */
export const useActiveReservationKeyForUserWallet = (labId, userAddress, options = {}) => {
  return useDefaultReadContract('getActiveReservationKeyForUser', [labId, userAddress], {
      enabled: !!labId && !!userAddress,
      ...BOOKING_QUERY_CONFIG,
      ...options,
    });
};

/**
 * Hook for getActiveReservationKeyForUser (Router - selects SSO or Wallet)
 * Gets the active reservation key for a user in a specific lab - routes to API or Wagmi based on user type
 * @param {string|number} labId - Lab ID to check
 * @param {string} userAddress - User address to check
 * @param {Object} [options={}] - Additional query options
 * @param {boolean} [options.isSSO] - Optional: force SSO or Wallet mode (for use outside UserContext)
 * @returns {Object} React Query result with reservation key (or 0x0 if no active booking)
 */
export const useActiveReservationKeyForUser = (labId, userAddress, options = {}) => {
  const isSSO = useGetIsSSO(options);
  
  const enabled = !!labId && !!userAddress;
  const ssoQuery = useActiveReservationKeyForUserSSO(labId, userAddress, { ...options, enabled: isSSO && enabled });
  const walletQuery = useActiveReservationKeyForUserWallet(labId, userAddress, { ...options, enabled: !isSSO && enabled });
  
  devLog.log(`🔀 useActiveReservationKeyForUser [${labId}, ${userAddress}] → ${isSSO ? 'SSO' : 'Wallet'} mode`);
  
  return isSSO ? ssoQuery : walletQuery;
};

// ===== useLabTokenAddress Hook Family =====

// Define queryFn first for reuse
const getLabTokenAddressQueryFn = createSSRSafeQuery(async () => {
  const response = await fetch('/api/contract/reservation/getLabTokenAddress', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch lab token address: ${response.status}`);
  }
  
  const data = await response.json();
  devLog.log('🔍 useLabTokenAddressSSO:', data);
  return data;
}, { tokenAddress: null }); // Return null during SSR

/**
 * Hook for /api/contract/reservation/getLabTokenAddress endpoint (SSO users)
 * Gets the token contract address for lab tokens via API + Ethers
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with token contract address
 */
export const useLabTokenAddressSSO = (options = {}) => {
  return useQuery({
    queryKey: bookingQueryKeys.labTokenAddress(),
    queryFn: () => getLabTokenAddressQueryFn(),
    ...BOOKING_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks
useLabTokenAddressSSO.queryFn = getLabTokenAddressQueryFn;

/**
 * Hook for getLabTokenAddress contract read (Wallet users)
 * Gets the token contract address for lab tokens directly from blockchain via Wagmi
 * @param {Object} [options={}] - Additional wagmi options
 * @returns {Object} Wagmi query result with token contract address
 */
export const useLabTokenAddressWallet = (options = {}) => {
  return useDefaultReadContract('getLabTokenAddress', [], {
      ...BOOKING_QUERY_CONFIG,
      ...options,
    });
};

/**
 * Hook for getLabTokenAddress (Router - selects SSO or Wallet)
 * Gets the token contract address for lab tokens - routes to API or Wagmi based on user type
 * @param {Object} [options={}] - Additional query options
 * @param {boolean} [options.isSSO] - Optional: force SSO or Wallet mode (for use outside UserContext)
 * @returns {Object} React Query result with token contract address
 */
export const useLabTokenAddress = (options = {}) => {
  const isSSO = useGetIsSSO(options);
  
  const ssoQuery = useLabTokenAddressSSO({ ...options, enabled: isSSO });
  const walletQuery = useLabTokenAddressWallet({ ...options, enabled: !isSSO });
  
  devLog.log(`🔀 useLabTokenAddress → ${isSSO ? 'SSO' : 'Wallet'} mode`);
  
  return isSSO ? ssoQuery : walletQuery;
};

// ===== useSafeBalance Hook Family =====

// Define queryFn first for reuse
const getSafeBalanceQueryFn = createSSRSafeQuery(async (userAddress) => {
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
  devLog.log('🔍 useSafeBalanceSSO:', userAddress, data);
  return data;
}, { balance: '0' }); // Return '0' during SSR

/**
 * Hook for /api/contract/reservation/getSafeBalance endpoint (SSO users)
 * Gets the safe balance for a specific user via API + Ethers
 * @param {string} userAddress - User address to get balance for
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with safe balance
 */
export const useSafeBalanceSSO = (userAddress, options = {}) => {
  return useQuery({
    queryKey: bookingQueryKeys.safeBalance(userAddress),
    queryFn: () => getSafeBalanceQueryFn(userAddress),
    enabled: !!userAddress,
    ...BOOKING_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks
useSafeBalanceSSO.queryFn = getSafeBalanceQueryFn;

/**
 * Hook for getSafeBalance contract read (Wallet users)
 * Gets the safe balance for a specific user directly from blockchain via Wagmi
 * @param {string} userAddress - User address to get balance for
 * @param {Object} [options={}] - Additional wagmi options
 * @returns {Object} Wagmi query result with safe balance
 */
export const useSafeBalanceWallet = (userAddress, options = {}) => {
  return useDefaultReadContract('getSafeBalance', [userAddress], {
      enabled: !!userAddress,
      ...BOOKING_QUERY_CONFIG,
      ...options,
    });
};

/**
 * Hook for getSafeBalance (Router - selects SSO or Wallet)
 * Gets the safe balance for a specific user - routes to API or Wagmi based on user type
 * @param {string} userAddress - User address to get balance for
 * @param {Object} [options={}] - Additional query options
 * @param {boolean} [options.isSSO] - Optional: force SSO or Wallet mode (for use outside UserContext)
 * @returns {Object} React Query result with safe balance
 */
export const useSafeBalance = (userAddress, options = {}) => {
  const isSSO = useGetIsSSO(options);
  
  const ssoQuery = useSafeBalanceSSO(userAddress, { ...options, enabled: isSSO && !!userAddress });
  const walletQuery = useSafeBalanceWallet(userAddress, { ...options, enabled: !isSSO && !!userAddress });
  
  devLog.log(`🔀 useSafeBalance [${userAddress}] → ${isSSO ? 'SSO' : 'Wallet'} mode`);
  
  return isSSO ? ssoQuery : walletQuery;
};
