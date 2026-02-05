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
import { useGetIsWallet } from '@/utils/hooks/authMode'
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
      
      // Contract returns: { labId, renter, price, labProvider, status, start, end, puc,
      //   requestPeriodStart, requestPeriodDuration, payerInstitution, collectorInstitution,
      //   providerShare, projectTreasuryShare, subsidiesShare, governanceShare }
      const status = Number(data.status);
      const renterAddress = data.renter || '0x0000000000000000000000000000000000000000';
      const labProviderAddress = data.labProvider || '0x0000000000000000000000000000000000000000';
      const payerInstitutionAddress = data.payerInstitution || '0x0000000000000000000000000000000000000000';
      const collectorInstitutionAddress = data.collectorInstitution || '0x0000000000000000000000000000000000000000';
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
              reservationState = 'Confirmed';
              isConfirmed = true;
              break;
            case 2:
              reservationState = 'In Use';
              isConfirmed = true;
              break;
            case 3:
              reservationState = 'Completed';
              isConfirmed = true;
              break;
            case 4:
              reservationState = 'Collected';
              isConfirmed = true;
              break;
            case 5:
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
          labProvider: labProviderAddress,
          start: data.start?.toString() || null,
          end: data.end?.toString() || null,
          status: status,
          puc: data.puc || '',
          requestPeriodStart: data.requestPeriodStart?.toString() || null,
          requestPeriodDuration: data.requestPeriodDuration?.toString() || null,
          payerInstitution: payerInstitutionAddress,
          collectorInstitution: collectorInstitutionAddress,
          providerShare: data.providerShare?.toString() || null,
          projectTreasuryShare: data.projectTreasuryShare?.toString() || null,
          subsidiesShare: data.subsidiesShare?.toString() || null,
          governanceShare: data.governanceShare?.toString() || null,
          reservationState: reservationState,
          isPending: status === 0,
          isBooked: status === 1,
          isInUse: status === 2,
          isUsed: status === 2, // backward compatibility alias
          isCollected: status === 4,
          isCanceled: status === 5,
          isActive: status === 1 || status === 2,
          isCompleted: status === 3 || status === 4,
          isConfirmed: isConfirmed,
          exists: exists,
          isInstitutional: payerInstitutionAddress !== '0x0000000000000000000000000000000000000000'
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
  const isWallet = useGetIsWallet(options);
  
  const ssoQuery = useReservationSSO(reservationKey, { ...options, enabled: !isWallet && !!reservationKey });
  const walletQuery = useReservationWallet(reservationKey, { ...options, enabled: isWallet && !!reservationKey });
  
  devLog.log(`🔀 useReservation [${reservationKey}] → ${isWallet ? 'Wallet' : 'SSO'} mode`);
  
  return isWallet ? walletQuery : ssoQuery;
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
  const isWallet = useGetIsWallet(options);
  
  const ssoQuery = useReservationsOfTokenSSO(labId, { ...options, enabled: !isWallet && !!labId });
  const walletQuery = useReservationsOfTokenWallet(labId, { ...options, enabled: isWallet && !!labId });
  
  devLog.log(`🔀 useReservationsOfToken [${labId}] → ${isWallet ? 'Wallet' : 'SSO'} mode`);
  
  return isWallet ? walletQuery : ssoQuery;
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
  const isWallet = useGetIsWallet(options);
  
  const enabled = !!labId && (index !== undefined && index !== null);
  const ssoQuery = useReservationOfTokenByIndexSSO(labId, index, { ...options, enabled: !isWallet && enabled });
  const walletQuery = useReservationOfTokenByIndexWallet(labId, index, { ...options, enabled: isWallet && enabled });
  
  devLog.log(`🔀 useReservationOfTokenByIndex [${labId}, ${index}] → ${isWallet ? 'Wallet' : 'SSO'} mode`);
  
  return isWallet ? walletQuery : ssoQuery;
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

// Wallet - address-based count (for useQueries in composed hooks)
const getReservationsOfWalletQueryFn = createSSRSafeQuery(async (userAddress) => {
  if (!userAddress) throw new Error('User address is required');
  
  const response = await fetch(`/api/contract/reservation/reservationsOf?userAddress=${userAddress}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch reservations for user ${userAddress}: ${response.status}`);
  }
  
  const data = await response.json();
  devLog.log('🔍 useReservationsOfWallet (API):', userAddress, data);
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

// Export queryFn for use in composed hooks (API-based, works for any address)
useReservationsOfWallet.queryFn = getReservationsOfWalletQueryFn;

/**
 * Hook for reservationsOf (Router - selects SSO or Wallet, auto-detects institutional)
 * Gets all reservations made by a specific user - routes to API or Wagmi based on user type
 * 
 * IMPORTANT: For institutional users (SSO without wallet address), pass userAddress=null
 * and the hook will automatically use the institutional endpoint with PUC from session.
 * 
 * @param {string|null} userAddress - User address (null for institutional users)
 * @param {Object} [options={}] - Additional query options
 * @param {boolean} [options.isSSO] - Optional: force SSO or Wallet mode (for use outside UserContext)
 * @param {boolean} [options.isInstitutional] - Optional: force institutional mode (auto-detected if userAddress is null)
 * @returns {Object} React Query result with user reservations
 */
export const useReservationsOf = (userAddress, options = {}) => {
  const isWallet = useGetIsWallet(options);
  
  const ssoQuery = useReservationsOfSSO({ ...options, enabled: !isWallet && (options.enabled ?? true) });
  const walletQuery = useReservationsOfWallet(userAddress, { ...options, enabled: isWallet && !!userAddress && (options.enabled ?? true) });
  
  devLog.log(`🔀 useReservationsOf ${isWallet ? `[${userAddress}] → Wallet mode` : '→ SSO (PUC-based)'}`);
  
  return isWallet ? walletQuery : ssoQuery;
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

// Wallet - address-based reservation key lookup (for useQueries in composed hooks)
const getReservationKeyOfUserByIndexWalletQueryFn = createSSRSafeQuery(async (userAddress, index) => {
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
  devLog.log('🔍 useReservationKeyOfUserByIndexWallet (API):', userAddress, index, data);
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

// Export queryFn for use in composed hooks (API-based, works for any address)
useReservationKeyOfUserByIndexWallet.queryFn = getReservationKeyOfUserByIndexWalletQueryFn;

/**
 * Hook for reservationKeyOfUserByIndex (Router - selects SSO or Wallet, auto-detects institutional)
 * Gets reservation key at specific index for a user - routes to API or Wagmi based on user type
 * 
 * IMPORTANT: For institutional users, pass userAddress=null and the hook will use
 * the institutional endpoint with PUC from session.
 * 
 * @param {string|null} userAddress - User address (null for institutional users)
 * @param {number} index - User's reservation index
 * @param {Object} [options={}] - Additional query options
 * @param {boolean} [options.isSSO] - Optional: force SSO or Wallet mode (for use outside UserContext)
 * @param {boolean} [options.isInstitutional] - Optional: force institutional mode (auto-detected if userAddress is null)
 * @returns {Object} React Query result with reservation key
*/
export const useReservationKeyOfUserByIndex = (userAddress, index, options = {}) => {
  const isWallet = useGetIsWallet(options);
  
  const indexValid = index !== undefined && index !== null;
  const ssoQuery = useReservationKeyOfUserByIndexSSO(index, { ...options, enabled: !isWallet && indexValid && (options.enabled ?? true) });
  const walletQuery = useReservationKeyOfUserByIndexWallet(userAddress, index, { ...options, enabled: isWallet && !!userAddress && indexValid && (options.enabled ?? true) });
  
  devLog.log(`🔀 useReservationKeyOfUserByIndex ${isWallet ? `[${userAddress}, ${index}] → Wallet mode` : `[${index}] → SSO (PUC-based)`}`);
  
  return isWallet ? walletQuery : ssoQuery;
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

export const useReservationsOfTokenByUserWallet = (labId, userAddress, options = {}) => {
  const offset = options.offset ?? 0;
  const limit = options.limit ?? 50;
  const result = useDefaultReadContract('getReservationsOfTokenByUserPaginated', [labId, userAddress, offset, limit], {
      enabled: !!labId && !!userAddress && (options.enabled ?? true),
      ...BOOKING_QUERY_CONFIG,
      ...options,
    });

  return {
    ...result,
    data: result.data ? {
      labId,
      userAddress,
      offset,
      limit,
      keys: Array.isArray(result.data[0]) ? result.data[0].map((k) => k.toString()) : [],
      total: Number(result.data[1] ?? 0),
    } : null,
  };
};

export const useReservationsOfTokenByUser = (labId, userAddress, options = {}) => {
  const isWallet = useGetIsWallet(options);
  const enabled = !!labId && !!userAddress && (options.enabled ?? true);
  const ssoQuery = useReservationsOfTokenByUserSSO(labId, userAddress, { ...options, enabled });
  const walletQuery = useReservationsOfTokenByUserWallet(labId, userAddress, { ...options, enabled });

  devLog.log(`🔀 useReservationsOfTokenByUser [${labId}, ${userAddress}] → ${isWallet ? 'Wallet' : 'SSO'} mode`);

  return isWallet ? walletQuery : ssoQuery;
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
  const isWallet = useGetIsWallet(options);
  
  const ssoQuery = useTotalReservationsSSO({ ...options, enabled: !isWallet });
  const walletQuery = useTotalReservationsWallet({ ...options, enabled: isWallet });
  
  devLog.log(`🔀 useTotalReservations → ${isWallet ? 'Wallet' : 'SSO'} mode`);
  
  return isWallet ? walletQuery : ssoQuery;
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
  const isWallet = useGetIsWallet(options);
  
  const ssoQuery = useUserOfReservationSSO(reservationKey, { ...options, enabled: !isWallet && !!reservationKey });
  const walletQuery = useUserOfReservationWallet(reservationKey, { ...options, enabled: isWallet && !!reservationKey });
  
  devLog.log(`🔀 useUserOfReservation [${reservationKey}] → ${isWallet ? 'Wallet' : 'SSO'} mode`);
  
  return isWallet ? walletQuery : ssoQuery;
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
  const isWallet = useGetIsWallet(options);
  
  const enabled = !!(labId && start && duration);
  const ssoQuery = useCheckAvailableSSO(labId, start, duration, { ...options, enabled: !isWallet && enabled });
  const walletQuery = useCheckAvailableWallet(labId, start, duration, { ...options, enabled: isWallet && enabled });
  
  devLog.log(`🔀 useCheckAvailable [${labId}, ${start}, ${duration}] → ${isWallet ? 'Wallet' : 'SSO'} mode`);
  
  return isWallet ? walletQuery : ssoQuery;
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
 * Hook for hasActiveBooking contract read (Wallet users)
 * Checks if a reservation is active for a specific user directly from blockchain via Wagmi
 * @param {string} reservationKey - Reservation key (bytes32)
 * @param {string} userAddress - User address to check
 * @param {Object} [options={}] - Additional wagmi options
 * @returns {Object} Wagmi query result with active booking status
 */
export const useHasActiveBookingWallet = (reservationKey, userAddress, options = {}) => {
  return useDefaultReadContract('hasActiveBooking', [reservationKey, userAddress], {
      enabled: !!reservationKey && !!userAddress,
      ...BOOKING_QUERY_CONFIG,
      ...options,
    });
};

/**
 * Hook for hasActiveBooking (Router - selects SSO or Wallet)
 * Checks if a reservation is active for a specific user - routes to API or Wagmi based on user type
 * @param {string} reservationKey - Reservation key (bytes32)
 * @param {string} userAddress - User address to check
 * @param {Object} [options={}] - Additional query options
 * @param {boolean} [options.isSSO] - Optional: force SSO or Wallet mode (for use outside UserContext)
 * @returns {Object} React Query result with active booking status
 */
export const useHasActiveBooking = (reservationKey, userAddress, options = {}) => {
  const isWallet = useGetIsWallet(options);
  
  const enabled = !!reservationKey && !!userAddress;
  const ssoQuery = useHasActiveBookingSSO(reservationKey, userAddress, { ...options, enabled: !isWallet && enabled });
  const walletQuery = useHasActiveBookingWallet(reservationKey, userAddress, { ...options, enabled: isWallet && enabled });
  
  devLog.log(`?? useHasActiveBooking [${reservationKey}] ? ${isWallet ? 'Wallet' : 'SSO'} mode`);
  
  return isWallet ? walletQuery : ssoQuery;
};
// ===== useHasActiveBookingByToken Hook Family =====

// Define queryFn first for reuse
const getHasActiveBookingByTokenQueryFn = createSSRSafeQuery(async (labId, userAddress) => {
  if (!labId || !userAddress) throw new Error('Lab ID and user address are required');
  
  const response = await fetch(
    `/api/contract/reservation/hasActiveBookingByToken?tokenId=${encodeURIComponent(labId)}&user=${encodeURIComponent(userAddress)}`,
    {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    },
  );
  
  if (!response.ok) {
    throw new Error(`Failed to check active booking for lab ${labId}: ${response.status}`);
  }
  
  const data = await response.json();
  devLog.log('?? useHasActiveBookingByTokenSSO:', labId, userAddress, data);
  return data;
}, { hasActiveBooking: false }); // Return false during SSR

/**
 * Hook for /api/contract/reservation/hasActiveBookingByToken endpoint (SSO users)
 * Checks if a specific lab token has any active booking for a user via API + Ethers
 * @param {string|number} labId - Lab ID to check
 * @param {string} userAddress - User address to check
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with active booking status for the lab
 */
export const useHasActiveBookingByTokenSSO = (labId, userAddress, options = {}) => {
  return useQuery({
    queryKey: bookingQueryKeys.hasActiveBookingByToken(labId, userAddress),
    queryFn: () => getHasActiveBookingByTokenQueryFn(labId, userAddress),
    enabled: !!labId && !!userAddress,
    ...BOOKING_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks
useHasActiveBookingByTokenSSO.queryFn = getHasActiveBookingByTokenQueryFn;

/**
 * Hook for hasActiveBookingByToken contract read (Wallet users)
 * Checks if a specific lab token has any active booking for a user directly from blockchain via Wagmi
 * @param {string|number} labId - Lab ID to check
 * @param {string} userAddress - User address to check
 * @param {Object} [options={}] - Additional wagmi options
 * @returns {Object} Wagmi query result with active booking status for the lab
 */
export const useHasActiveBookingByTokenWallet = (labId, userAddress, options = {}) => {
  return useDefaultReadContract('hasActiveBookingByToken', [labId, userAddress], {
      enabled: !!labId && !!userAddress,
      ...BOOKING_QUERY_CONFIG,
      ...options,
    });
};

/**
 * Hook for hasActiveBookingByToken (Router - selects SSO or Wallet)
 * Checks if a specific lab token has any active booking for a user - routes to API or Wagmi based on user type
 * @param {string|number} labId - Lab ID to check
 * @param {string} userAddress - User address to check
 * @param {Object} [options={}] - Additional query options
 * @param {boolean} [options.isSSO] - Optional: force SSO or Wallet mode (for use outside UserContext)
 * @returns {Object} React Query result with active booking status for the lab
 */
export const useHasActiveBookingByToken = (labId, userAddress, options = {}) => {
  const isWallet = useGetIsWallet(options);
  
  const enabled = !!labId && !!userAddress;
  const ssoQuery = useHasActiveBookingByTokenSSO(labId, userAddress, { ...options, enabled: !isWallet && enabled });
  const walletQuery = useHasActiveBookingByTokenWallet(labId, userAddress, { ...options, enabled: isWallet && enabled });
  
  devLog.log(`?? useHasActiveBookingByToken [${labId}] ? ${isWallet ? 'Wallet' : 'SSO'} mode`);
  
  return isWallet ? walletQuery : ssoQuery;
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
  const isWallet = useGetIsWallet(options);
  
  const enabled = !!labId && !!userAddress;
  const ssoQuery = useActiveReservationKeyForUserSSO(labId, userAddress, { ...options, enabled: !isWallet && enabled });
  const walletQuery = useActiveReservationKeyForUserWallet(labId, userAddress, { ...options, enabled: isWallet && enabled });
  
  devLog.log(`🔀 useActiveReservationKeyForUser [${labId}, ${userAddress}] → ${isWallet ? 'Wallet' : 'SSO'} mode`);
  
  return isWallet ? walletQuery : ssoQuery;
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

// Router-friendly wrappers (Wallet users have no institutional path, so disable when not SSO)
export const useActiveReservationKeyForSessionUser = (labId, options = {}) => {
  const isWallet = useGetIsWallet(options)
  return useActiveReservationKeyForSessionUserSSO(labId, {
    ...options,
    enabled: !isWallet && !!labId && (options.enabled ?? true),
  })
}

export const useHasActiveBookingForSessionUser = (options = {}) => {
  const isWallet = useGetIsWallet(options)
  return useHasActiveBookingForSessionUserSSO({
    ...options,
    enabled: !isWallet && (options.enabled ?? true),
  })
}

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
  const isWallet = useGetIsWallet(options);
  
  const ssoQuery = useLabTokenAddressSSO({ ...options, enabled: !isWallet });
  const walletQuery = useLabTokenAddressWallet({ ...options, enabled: isWallet });
  
  devLog.log(`🔀 useLabTokenAddress → ${isWallet ? 'Wallet' : 'SSO'} mode`);
  
  return isWallet ? walletQuery : ssoQuery;
};

// ===== useSafeBalance Hook Family =====

// Define queryFn first for reuse
const getSafeBalanceQueryFn = createSSRSafeQuery(async () => {
  const response = await fetch('/api/contract/reservation/getSafeBalance', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch safe balance: ${response.status}`);
  }
  
  const data = await response.json();
  devLog.log('?? useSafeBalanceSSO:', data);
  return data;
}, { safeBalance: '0' }); // Return '0' during SSR

/**
 * Hook for /api/contract/reservation/getSafeBalance endpoint (SSO users)
 * Gets the safe balance via API + Ethers
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with safe balance
 */
export const useSafeBalanceSSO = (options = {}) => {
  return useQuery({
    queryKey: bookingQueryKeys.safeBalance(),
    queryFn: () => getSafeBalanceQueryFn(),
    ...BOOKING_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks
useSafeBalanceSSO.queryFn = getSafeBalanceQueryFn;

/**
 * Hook for getSafeBalance contract read (Wallet users)
 * Gets the safe balance directly from blockchain via Wagmi
 * @param {Object} [options={}] - Additional wagmi options
 * @returns {Object} Wagmi query result with safe balance
 */
export const useSafeBalanceWallet = (options = {}) => {
  return useDefaultReadContract('getSafeBalance', [], {
      ...BOOKING_QUERY_CONFIG,
      ...options,
    });
};

/**
 * Hook for getSafeBalance (Router - selects SSO or Wallet)
 * Gets the safe balance - routes to API or Wagmi based on user type
 * @param {Object} [options={}] - Additional query options
 * @param {boolean} [options.isSSO] - Optional: force SSO or Wallet mode (for use outside UserContext)
 * @returns {Object} React Query result with safe balance
 */
export const useSafeBalance = (options = {}) => {
  const isWallet = useGetIsWallet(options);
  
  const ssoQuery = useSafeBalanceSSO({ ...options, enabled: !isWallet });
  const walletQuery = useSafeBalanceWallet({ ...options, enabled: isWallet });
  
  devLog.log(`🔀 useSafeBalance → ${isWallet ? 'Wallet' : 'SSO'} mode`);
  
  return isWallet ? walletQuery : ssoQuery;
};
