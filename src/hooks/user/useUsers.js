/**
 * React Query Hooks for User-related data
 * Uses simple hooks with composed services and cache-extracting hooks
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { userServices } from '@/services/userServices'
import { QUERY_KEYS, INVALIDATION_PATTERNS } from '@/utils/hooks/queryKeys'
import { useMemo } from 'react'

// ===============================
// === MAIN COMPOSED HOOKS ===
// ===============================

// === CACHE-EXTRACTING HOOKS (simple data operations) ===

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

      // For now, only support wallet addresses with the composed service
      // Email support can be added later if needed
      if (isEmail) {
        throw new Error('Email-based provider lookup not yet supported in composed service');
      }

      // Use the composed service for complete provider data
      const result = await userServices.fetchProviderStatusComposed(identifier);
      
      console.log('🔍 useProviderStatusQuery Final Result:', result);
      
      return result;
    },
    staleTime: 6 * 60 * 60 * 1000, // 6 hours (provider status changes very rarely)
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
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

      const response = await fetch('/api/contract/provider/getLabProviderName', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ wallet }),
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`Provider name fetch failed: ${response.status}`);
      }

      const result = await response.json();
      
      return result.providerName || null;
    },
    staleTime: 6 * 60 * 60 * 1000, // 6 hours (provider names change very rarely)
    gcTime: 48 * 60 * 60 * 1000, // 48 hours
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
      // Provider status cache refreshed
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
    staleTime: 48 * 60 * 60 * 1000, // 48 hours (individual provider data very stable)
    gcTime: 2 * 7 * 24 * 60 * 60 * 1000, // 2 weeks
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
      const response = await fetch('/api/auth/session', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.status === 401) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`SSO session fetch failed: ${response.status}`);
      }

      const data = await response.json();
      
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes (session data should be fairly fresh)
    gcTime: 15 * 60 * 1000, // 15 minutes
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
