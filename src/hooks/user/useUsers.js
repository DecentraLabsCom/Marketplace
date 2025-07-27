/**
 * React Query Hooks for User-related data
 * Unified file that combines SSO, authentication, profiles, and permissions
 * Replaces both useUser.js and useUsers.js
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { userServices } from '@/services/userServices'
import { QUERY_KEYS, INVALIDATION_PATTERNS } from '@/utils/hooks/queryKeys'
import devLog from '@/utils/dev/logger'

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
    queryKey: [QUERY_KEYS.SSO_SESSION],
    queryFn: async () => {
      devLog.log('🚨 [useSSOSessionQuery] Making API CALL to /api/auth/sso/session');
      
      const response = await fetch('/api/auth/sso/session', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`SSO session fetch failed: ${response.status}`);
      }

      const data = await response.json();
      devLog.log('✅ [useSSOSessionQuery] SSO session data received:', data);
      
      return data;
    },
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
    enabled: true, // Always enabled since SSO is important
    ...options,
  });
};

/**
 * Hook to get provider status for a wallet address or email
 * @param {string} identifier - Wallet address or email to check
 * @param {boolean} [isEmail=false] - Whether the identifier is an email
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with provider status data, loading state, and error handling
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
 * Hook to get provider name for a wallet address
 * @param {string} wallet - Wallet address to get the provider name for
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with provider name data, loading state, and error handling
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
    staleTime: 5 * 60 * 1000, // 5 minutes - provider names are quite stable
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 1,
    enabled: Boolean(wallet), // Only run if wallet exists
    ...options,
  });
};

// ===============================
// === USER PROFILES & DATA ===
// ===============================

/**
 * Hook to get user profile
 * @param {string} userAddress - User's wallet address
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with user profile data, loading state, and error handling
 */
export const useUserProfileQuery = (userAddress, options = {}) => {
  return useQuery({
    queryKey: QUERY_KEYS.USER.profile(userAddress),
    queryFn: () => userServices.fetchUserProfile(userAddress),
    enabled: !!userAddress,
    staleTime: 15 * 60 * 1000, // 15 minutos
    gcTime: 12 * 60 * 60 * 1000, // 12 horas
    retry: 2,
    ...options,
  });
};

/**
 * Hook to get user status/permissions
 * @param {string} userAddress - User's wallet address
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with user status data, loading state, and error handling
 */
export const useUserStatusQuery = (userAddress, options = {}) => {
  return useQuery({
    queryKey: QUERY_KEYS.USER.status(userAddress),
    queryFn: () => userServices.fetchUserStatus(userAddress),
    enabled: !!userAddress,
    staleTime: 15 * 60 * 1000, // 15 minutes
    gcTime: 12 * 60 * 60 * 1000, // 12 hours
    retry: 2,
    ...options,
  });
};

/**
 * Combined hook for complete user data
 * @param {string} userAddress - User's wallet address
 * @param {Object} [options={}] - Additional react-query options to pass to underlying queries
 * @returns {Object} Combined result object with profile and status queries, plus aggregated loading/error states
 */
export const useUserDataQuery = (userAddress, options = {}) => {
  const profileQuery = useUserProfileQuery(userAddress, options);
  const statusQuery = useUserStatusQuery(userAddress, options);

  return {
    profile: profileQuery,
    status: statusQuery,
    // Combined state
    isLoading: profileQuery.isLoading || statusQuery.isLoading,
    isError: profileQuery.isError || statusQuery.isError,
    error: profileQuery.error || statusQuery.error,
    // Combined data
    data: profileQuery.data && statusQuery.data ? {
      profile: profileQuery.data,
      status: statusQuery.data,
    } : undefined,
  };
};

// ===============================
// === MUTATIONS ===
// ===============================

/**
 * Hook to refresh SSO session
 * @returns {Object} React Query mutation object for refreshing SSO session
 */
export const useRefreshSSOSessionMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      devLog.log('🔄 [useRefreshSSOSessionMutation] Refreshing SSO session');
      
      const response = await fetch('/api/auth/sso/session', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`SSO session refresh failed: ${response.status}`);
      }

      return response.json();
    },
    onSuccess: (data) => {
      // Update the SSO session cache
      queryClient.setQueryData([QUERY_KEYS.SSO_SESSION], data);
      devLog.log('✅ [useRefreshSSOSessionMutation] SSO session refreshed successfully');
    },
    onError: (error) => {
      devLog.error('❌ [useRefreshSSOSessionMutation] Failed to refresh SSO session:', error);
    },
  });
};

/**
 * Hook to refresh provider status
 * @returns {Object} React Query mutation object for refreshing provider status by identifier
 */
export const useRefreshProviderStatusMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ identifier, isEmail = false }) => {
      devLog.log(`🔄 [useRefreshProviderStatusMutation] Refreshing provider status for ${identifier}`);
      
      // Invalidate the specific provider status query
      await queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.PROVIDER.status(identifier, isEmail)
      });

      // If it's a wallet, also invalidate provider name
      if (!isEmail) {
        await queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.PROVIDER.name(identifier)
        });
      }

      return { success: true };
    },
    onSuccess: ({ identifier }) => {
      devLog.log(`✅ [useRefreshProviderStatusMutation] Provider status refreshed for ${identifier}`);
    },
    onError: (error) => {
      devLog.error('❌ [useRefreshProviderStatusMutation] Failed to refresh provider status:', error);
    },
  });
};

// ===============================
// === CACHE MANAGEMENT ===
// ===============================

/**
 * Hook to invalidate user cache manually
 * @returns {Object} Object with functions for invalidating specific user/provider cache keys
 */
export const useUserCacheInvalidation = () => {
  const queryClient = useQueryClient();
  
  return {
    // SSO & Authentication invalidation
    invalidateSSOSession: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SSO_SESSION] });
    },
    
    invalidateProviderStatus: (identifier, isEmail = false) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PROVIDER.status(identifier, isEmail) });
    },
    
    invalidateProviderName: (wallet) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PROVIDER.name(wallet) });
    },

    // User profile invalidation
    invalidateUserProfile: (userAddress) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USER.profile(userAddress) });
    },
    
    invalidateUserStatus: (userAddress) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USER.status(userAddress) });
    },
    
    invalidateAllUserData: (userAddress) => {
      INVALIDATION_PATTERNS.userData(userAddress).forEach(queryKey => {
        queryClient.invalidateQueries({ queryKey });
      });
    },
    
    // Force refetch without invalidation
    refetchUserProfile: (userAddress) => {
      queryClient.refetchQueries({ queryKey: QUERY_KEYS.USER.profile(userAddress) });
    },
    
    refetchUserStatus: (userAddress) => {
      queryClient.refetchQueries({ queryKey: QUERY_KEYS.USER.status(userAddress) });
    },
  };
};

// ===============================
// === CACHE INVALIDATION HOOKS ===
// ===============================

/**
 * Hook to get cache invalidation functions
 * Encapsulates query key logic and provides clean invalidation API
 * @returns {Object} Object with functions for invalidating different types of cache data (bookings, labs, users, providers)
 */
export const useCacheInvalidation = () => {
  const queryClient = useQueryClient();

  return {
    // Booking invalidations
    invalidateUserBookings: (address) => {
      if (!address) return;
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.BOOKINGS.user(address)
      });
      devLog.log(`🔄 Invalidated user bookings for: ${address}`);
    },

    invalidateLabBookings: (labId) => {
      if (!labId) return;
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.BOOKINGS.lab(labId)
      });
      devLog.log(`🔄 Invalidated lab bookings for: ${labId}`);
    },

    invalidateAllBookings: () => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.BOOKINGS.all
      });
      devLog.log(`🔄 Invalidated all bookings`);
    },

    // Lab invalidations
    invalidateLabData: (labId) => {
      if (!labId) return;
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.LABS.data(labId)
      });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.LABS.owner(labId)
      });
      devLog.log(`🔄 Invalidated lab data for: ${labId}`);
    },

    invalidateAllLabs: () => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.LABS.list
      });
      devLog.log(`🔄 Invalidated all labs`);
    },

    // User invalidations
    invalidateUserData: (address) => {
      if (!address) return;
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.USER.profile(address)
      });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.USER.status(address)
      });
      devLog.log(`🔄 Invalidated user data for: ${address}`);
    },

    // SSO invalidations
    invalidateSSOSession: () => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.SSO_SESSION
      });
      devLog.log(`🔄 Invalidated SSO session`);
    },

    // Provider invalidations
    invalidateProviderData: (providerId) => {
      if (!providerId) return;
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.PROVIDER.profile(providerId)
      });
      // Invalidate provider status for both email and wallet scenarios
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.PROVIDER.status(providerId, false)
      });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.PROVIDER.status(providerId, true)
      });
      devLog.log(`🔄 Invalidated provider data for: ${providerId}`);
    },

    // Combined invalidations (common use cases)
    invalidateBookingRelatedData: (address, labId) => {
      if (address) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.BOOKINGS.user(address)
        });
      }
      if (labId) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.BOOKINGS.lab(labId)
        });
      }
      devLog.log(`🔄 Invalidated booking-related data (user: ${address}, lab: ${labId})`);
    },

    // Optimistic updates for immediate UI feedback
    addOptimisticBooking: (bookingData) => {
      const { labId, start, timeslot, cost, optimisticBookingId, userAddress } = bookingData;
      
      // Create optimistic booking object that matches the expected structure
      const optimisticBooking = {
        id: optimisticBookingId || `temp_${Date.now()}`,
        labId: labId,
        user: userAddress || 'current_user',
        renter: userAddress || 'current_user',
        start: start,
        end: start + timeslot,
        duration: timeslot,
        status: "0", // "0" = requested status
        cost: cost?.toString() || "0",
        isOptimistic: true,
        timestamp: Date.now(),
        optimisticBookingId: optimisticBookingId
      };

      try {
        // Update USER bookings cache (for UserDashboard, Market)
        queryClient.setQueryData(
          QUERY_KEYS.BOOKINGS.user(userAddress), 
          (oldUserBookings = []) => {
            devLog.log('✅ Adding optimistic booking to user cache:', optimisticBooking);
            return [...oldUserBookings, optimisticBooking];
          }
        );
        
        // Update LAB bookings cache (for ProviderDashboard, LabReservation)
        queryClient.setQueryData(
          QUERY_KEYS.BOOKINGS.lab(labId), 
          (oldLabBookings = []) => {
            devLog.log('✅ Adding optimistic booking to lab cache:', optimisticBooking);
            return [...oldLabBookings, optimisticBooking];
          }
        );
        
        devLog.log('✅ Optimistic booking added to ALL relevant caches without refetch:', optimisticBooking);
        
        return optimisticBooking;
      } catch (error) {
        devLog.error('❌ Failed to add optimistic booking:', error);
        return null;
      }
    },

    // Remove optimistic booking (for error handling)
    removeOptimisticBooking: (optimisticBookingId, userAddress, labId) => {
      if (!optimisticBookingId) return;

      try {
        // Remove from USER bookings cache
        if (userAddress) {
          queryClient.setQueryData(
            QUERY_KEYS.BOOKINGS.user(userAddress), 
            (oldUserBookings = []) => {
              const filtered = oldUserBookings.filter(booking => 
                booking.optimisticBookingId !== optimisticBookingId
              );
              devLog.log('🗑️ Removed optimistic booking from user cache:', optimisticBookingId);
              return filtered;
            }
          );
        }
        
        // Remove from LAB bookings cache
        if (labId) {
          queryClient.setQueryData(
            QUERY_KEYS.BOOKINGS.lab(labId), 
            (oldLabBookings = []) => {
              const filtered = oldLabBookings.filter(booking => 
                booking.optimisticBookingId !== optimisticBookingId
              );
              devLog.log('🗑️ Removed optimistic booking from lab cache:', optimisticBookingId);
              return filtered;
            }
          );
        }
        
        devLog.log('✅ Optimistic booking removed from caches:', optimisticBookingId);
      } catch (error) {
        devLog.error('❌ Failed to remove optimistic booking:', error);
      }
    },
  };
};
