/**
 * React Query Hooks for User-related data
 * Uses simple hooks with composed services and cache-extracting hooks
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { userServices } from '@/services/userServices'
import { QUERY_KEYS, INVALIDATION_PATTERNS } from '@/utils/hooks/queryKeys'
import devLog from '@/utils/dev/logger'
import { useMemo } from 'react'

// ===============================
// === MAIN COMPOSED HOOKS ===
// ===============================

/**
 * Hook to get all provider data in a single composed call
 * This is the primary data source that uses a single HTTP request orchestration
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with all composed provider data
 */
export const useAllProvidersQuery = (options = {}) => {
  return useQuery({
    queryKey: ['providers', 'all-composed'],
    queryFn: () => userServices.fetchAllProvidersComposed(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    refetchInterval: false,
    retry: 2,
    ...options,
  });
};

/**
 * Hook to get complete user data in a single composed call
 * @param {string} userAddress - User's wallet address
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with all composed user data
 */
export const useUserDataQuery = (userAddress, options = {}) => {
  return useQuery({
    queryKey: ['users', 'data-composed', userAddress],
    queryFn: () => userServices.fetchUserDataComposed(userAddress),
    enabled: !!userAddress,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    refetchInterval: false,
    retry: 2,
    ...options,
  });
};

// === CACHE-EXTRACTING HOOKS (simple data operations) ===

/**
 * Hook to get providers list (extracts from composed data)
 * @returns {Object} Provider list with loading and error states
 */
export const useProvidersListQuery = () => {
  const allProvidersQuery = useAllProvidersQuery();
  
  return useMemo(() => ({
    data: allProvidersQuery.data?.providers || [],
    isLoading: allProvidersQuery.isLoading,
    error: allProvidersQuery.error,
    refetch: allProvidersQuery.refetch,
  }), [allProvidersQuery.data, allProvidersQuery.isLoading, allProvidersQuery.error]);
};

/**
 * Hook to get provider count (extracts from composed data)
 * @returns {Object} Provider count with loading and error states
 */
export const useProviderCountQuery = () => {
  const allProvidersQuery = useAllProvidersQuery();
  
  return useMemo(() => ({
    data: allProvidersQuery.data?.count || 0,
    isLoading: allProvidersQuery.isLoading,
    error: allProvidersQuery.error,
    refetch: allProvidersQuery.refetch,
  }), [allProvidersQuery.data, allProvidersQuery.isLoading, allProvidersQuery.error]);
};

/**
 * Hook to check if a user is a provider (extracts from user data)
 * @param {string} userAddress - User's wallet address
 * @returns {Object} Provider status with loading and error states
 */
export const useIsProviderQuery = (userAddress) => {
  const userDataQuery = useUserDataQuery(userAddress);
  
  return useMemo(() => ({
    data: userDataQuery.data?.isProvider || false,
    isLoading: userDataQuery.isLoading,
    error: userDataQuery.error,
    refetch: userDataQuery.refetch,
  }), [userDataQuery.data, userDataQuery.isLoading, userDataQuery.error]);
};

/**
 * Hook to get provider status for a wallet address or email (legacy compatibility)
 * @param {string} identifier - Wallet address or email to check
 * @param {boolean} [isEmail=false] - Whether the identifier is an email
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with provider status data
 */
export const useProviderStatusQuery = (identifier, isEmail = false, options = {}) => {
  return useQuery({
    queryKey: QUERY_KEYS.PROVIDER.status(identifier, isEmail),
    queryFn: async () => {
      if (!identifier) {
        throw new Error('Identifier is required for provider status');
      }

      const endpoint = isEmail 
        ? `/api/contract/provider/isLabProvider`
        : `/api/contract/provider/isLabProvider`;

      devLog.log(`🚨 [useProviderStatusQuery] Making API CALL to ${endpoint} for ${identifier}`);

      const requestBody = isEmail 
        ? { email: identifier }
        : { wallet: identifier };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (response.status === 404) {
        devLog.log(`ℹ️ [useProviderStatusQuery] Not a provider (404), returning false for ${identifier}`);
        return { isLabProvider: false, providerName: null };
      }

      if (!response.ok) {
        throw new Error(`Provider status fetch failed: ${response.status}`);
      }

      const result = await response.json();
      devLog.log(`✅ [useProviderStatusQuery] Provider status for ${identifier}:`, result);
      
      return {
        isLabProvider: Boolean(result.isLabProvider),
        providerName: result.providerName || null
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 1,
    enabled: Boolean(identifier), // Only run if identifier exists
    ...options,
  });
};

/**
 * Hook to get provider name for a wallet address (legacy compatibility)
 * @param {string} wallet - Wallet address to get the provider name for
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with provider name data
 */
export const useProviderNameQuery = (wallet, options = {}) => {
  return useQuery({
    queryKey: QUERY_KEYS.PROVIDER.name(wallet),
    queryFn: async () => {
      if (!wallet) {
        throw new Error('Wallet address is required for provider name');
      }

      devLog.log(`🚨 [useProviderNameQuery] Making API CALL for provider name: ${wallet}`);

      const response = await fetch('/api/contract/provider/getLabProviderName', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ wallet }),
      });

      if (response.status === 404) {
        devLog.log(`ℹ️ [useProviderNameQuery] No provider name found (404) for ${wallet}`);
        return null;
      }

      if (!response.ok) {
        throw new Error(`Provider name fetch failed: ${response.status}`);
      }

      const result = await response.json();
      devLog.log(`✅ [useProviderNameQuery] Provider name for ${wallet}:`, result.providerName);
      
      return result.providerName || null;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes (provider names change rarely)
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 1,
    enabled: Boolean(wallet),
    ...options,
  });
};

/**
 * Hook to refresh provider status (legacy compatibility)
 * @returns {Object} React Query mutation object for refreshing provider status
 */
export const useRefreshProviderStatusMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ identifier, isEmail = false }) => {
      // Just invalidate the relevant queries to force a refresh
      if (isEmail) {
        queryClient.invalidateQueries({ 
          queryKey: QUERY_KEYS.PROVIDER.status(identifier, true) 
        });
      } else {
        queryClient.invalidateQueries({ 
          queryKey: QUERY_KEYS.PROVIDER.status(identifier, false) 
        });
        queryClient.invalidateQueries({ 
          queryKey: QUERY_KEYS.PROVIDER.name(identifier) 
        });
      }
      
      return { refreshed: true };
    },
    onSuccess: () => {
      devLog.log('✅ Provider status cache refreshed');
    },
  });
};

// === ATOMIC HOOKS (for special use cases) ===

/**
 * Hook to get specific provider by ID (atomic call when needed)
 * @param {string|number} providerId - Provider ID to fetch
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with provider details
 */
export const useProviderByIdQuery = (providerId, options = {}) => {
  return useQuery({
    queryKey: QUERY_KEYS.PROVIDER.byId(providerId),
    queryFn: () => userServices.fetchProviderById(providerId),
    enabled: !!providerId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
    ...options,
  });
};

// ===============================
// === SSO & AUTHENTICATION ===
// ===============================

/**
 * Hook to get SSO session data
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with SSO session data, loading state, and error handling
 */
export const useSSOSessionQuery = (options = {}) => {
  return useQuery({
    queryKey: QUERY_KEYS.AUTH.ssoSession,
    queryFn: async () => {
      devLog.log('🚨 [useSSOSessionQuery] Making API CALL to /api/auth/session');
      
      const response = await fetch('/api/auth/session', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.status === 401) {
        devLog.log('ℹ️ [useSSOSessionQuery] No SSO session (401)');
        return null;
      }

      if (!response.ok) {
        throw new Error(`SSO session fetch failed: ${response.status}`);
      }

      const data = await response.json();
      devLog.log('✅ [useSSOSessionQuery] SSO session data received:', data);
      
      return data;
    },
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: false, // Don't retry auth requests
    enabled: true, // Always enabled since SSO is important
    ...options,
  });
};

// ===============================
// === CACHE INVALIDATION UTILITIES ===
// ===============================

/**
 * Hook for cache invalidation utilities
 * Used by event contexts to invalidate related caches
 * @returns {Object} Cache invalidation functions
 */
export const useCacheInvalidation = () => {
  const queryClient = useQueryClient();

  return {
    /**
     * Invalidate all user-related caches
     * @param {string} userAddress - User address to invalidate
     */
    invalidateUserCache: (userAddress) => {
      if (userAddress) {
        queryClient.invalidateQueries({ 
          queryKey: ['users', 'data-composed', userAddress] 
        });
      }
    },

    /**
     * Invalidate all provider-related caches
     */
    invalidateProviderCache: () => {
      queryClient.invalidateQueries({ 
        queryKey: ['providers', 'all-composed'] 
      });
    },

    /**
     * Invalidate booking caches for a user
     * @param {string} userAddress - User address
     */
    invalidateUserBookings: (userAddress) => {
      if (userAddress) {
        queryClient.invalidateQueries({ 
          queryKey: ['bookings', 'user-composed', userAddress] 
        });
      }
    },

    /**
     * Invalidate booking caches for a lab
     * @param {string|number} labId - Lab ID
     */
    invalidateLabBookings: (labId) => {
      if (labId) {
        queryClient.invalidateQueries({ 
          queryKey: ['bookings', 'lab-composed', labId] 
        });
      }
    },
  };
};

// ===============================
// === UTILITY HOOKS ===
// ===============================

/**
 * Utility function to add booking to user cache optimistically
 * @param {Object} queryClient - React Query client
 * @param {string} userAddress - User address
 * @param {Object} booking - Booking object to add
 */
export const addOptimisticBooking = (queryClient, userAddress, booking) => {
  if (!userAddress) return;
  
  const userBookingsKey = ['bookings', 'user-composed', userAddress];
  const currentBookings = queryClient.getQueryData(userBookingsKey);
  
  if (currentBookings) {
    queryClient.setQueryData(userBookingsKey, {
      ...currentBookings,
      bookings: [...(currentBookings.bookings || []), booking]
    });
  }
};

/**
 * Utility function to remove booking from user cache optimistically
 * @param {Object} queryClient - React Query client
 * @param {string} userAddress - User address
 * @param {string} bookingId - Booking ID to remove
 */
export const removeOptimisticBooking = (queryClient, userAddress, bookingId) => {
  if (!userAddress) return;
  
  const userBookingsKey = ['bookings', 'user-composed', userAddress];
  const currentBookings = queryClient.getQueryData(userBookingsKey);
  
  if (currentBookings) {
    queryClient.setQueryData(
      userBookingsKey, 
      {
        ...currentBookings,
        bookings: (currentBookings.bookings || []).filter(booking => booking.id !== bookingId)
      }
    );
  }
};
