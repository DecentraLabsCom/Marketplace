/**
 * React Query Hooks for User-related data
 * Unified file that combines SSO, authentication, profiles, and permissions
 * Replaces both useUser.js and useUsers.js
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { userServices } from '@/services/userServices'
import { QUERY_KEYS, INVALIDATION_PATTERNS } from '@/utils/queryKeys'
import devLog from '@/utils/dev/logger'

// ===============================
// === SSO & AUTHENTICATION ===
// ===============================

/**
 * Hook to get SSO session data
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
 */
export const useProviderStatusQuery = (identifier, isEmail = false, options = {}) => {
  return useQuery({
    queryKey: [QUERY_KEYS.PROVIDER_STATUS, identifier, isEmail],
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
 */
export const useProviderNameQuery = (wallet, options = {}) => {
  return useQuery({
    queryKey: [QUERY_KEYS.PROVIDER_NAME, wallet],
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
// === DERIVED QUERIES ===
// ===============================

/**
 * Combined hook to check if the user is a provider
 */
export const useIsProviderQuery = (userAddress, options = {}) => {
  const statusQuery = useUserStatusQuery(userAddress, options);

  return {
    ...statusQuery,
    data: statusQuery.data ? statusQuery.data.isProvider : undefined,
  };
};

/**
 * Hook to check user permissions
 */
export const useUserPermissionsQuery = (userAddress, options = {}) => {
  const statusQuery = useUserStatusQuery(userAddress, options);

  return {
    ...statusQuery,
    data: statusQuery.data ? statusQuery.data.permissions : undefined,
  };
};

// ===============================
// === MUTATIONS ===
// ===============================

/**
 * Hook to refresh SSO session
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
 */
export const useRefreshProviderStatusMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ identifier, isEmail = false }) => {
      devLog.log(`🔄 [useRefreshProviderStatusMutation] Refreshing provider status for ${identifier}`);
      
      // Invalidate the specific provider status query
      await queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.PROVIDER_STATUS, identifier, isEmail]
      });

      // If it's a wallet, also invalidate provider name
      if (!isEmail) {
        await queryClient.invalidateQueries({
          queryKey: [QUERY_KEYS.PROVIDER_NAME, identifier]
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
 */
export const useUserCacheInvalidation = () => {
  const queryClient = useQueryClient();
  
  return {
    // SSO & Authentication invalidation
    invalidateSSOSession: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SSO_SESSION] });
    },
    
    invalidateProviderStatus: (identifier, isEmail = false) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.PROVIDER_STATUS, identifier, isEmail] });
    },
    
    invalidateProviderName: (wallet) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.PROVIDER_NAME, wallet] });
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
// === PREFETCH UTILITIES ===
// ===============================

/**
 * Hook to prefetch user data
 */
export const useUserPrefetch = () => {
  const queryClient = useQueryClient();
  
  return {
    // SSO & Authentication prefetch
    prefetchSSOSession: () => {
      queryClient.prefetchQuery({
        queryKey: [QUERY_KEYS.SSO_SESSION],
        queryFn: async () => {
          const response = await fetch('/api/auth/sso/session');
          return response.json();
        },
        staleTime: 30 * 1000,
      });
    },

    prefetchProviderStatus: (identifier, isEmail = false) => {
      queryClient.prefetchQuery({
        queryKey: [QUERY_KEYS.PROVIDER_STATUS, identifier, isEmail],
        queryFn: async () => {
          const endpoint = '/api/contract/provider/isLabProvider';
          const requestBody = isEmail ? { email: identifier } : { wallet: identifier };
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          });
          return response.json();
        },
        staleTime: 5 * 60 * 1000,
      });
    },

    // User profile prefetch
    prefetchUserProfile: (userAddress) => {
      queryClient.prefetchQuery({
        queryKey: QUERY_KEYS.USER.profile(userAddress),
        queryFn: () => userServices.fetchUserProfile(userAddress),
        staleTime: 15 * 60 * 1000,
      });
    },
    
    prefetchUserStatus: (userAddress) => {
      queryClient.prefetchQuery({
        queryKey: QUERY_KEYS.USER.status(userAddress),
        queryFn: () => userServices.fetchUserStatus(userAddress),
        staleTime: 15 * 60 * 1000,
      });
    },
    
    prefetchAllUserData: (userAddress) => {
      Promise.all([
        queryClient.prefetchQuery({
          queryKey: QUERY_KEYS.USER.profile(userAddress),
          queryFn: () => userServices.fetchUserProfile(userAddress),
          staleTime: 15 * 60 * 1000,
        }),
        queryClient.prefetchQuery({
          queryKey: QUERY_KEYS.USER.status(userAddress),
          queryFn: () => userServices.fetchUserStatus(userAddress),
          staleTime: 15 * 60 * 1000,
        }),
      ]);
    },
  };
};

// ===============================
// === SYNCHRONIZATION UTILITIES ===
// ===============================

/**
 * Hook to synchronize data between React Query and legacy contexts
 * Used during gradual migration
 */
export const useUserSyncUtilities = () => {
  const queryClient = useQueryClient();
  
  return {
    // Synchronize data from React Query to legacy contexts
    syncToLegacy: (userAddress, legacySetters) => {
      const profile = queryClient.getQueryData(QUERY_KEYS.USER.profile(userAddress));
      const status = queryClient.getQueryData(QUERY_KEYS.USER.status(userAddress));
      const ssoData = queryClient.getQueryData([QUERY_KEYS.SSO_SESSION]);
      const providerStatus = queryClient.getQueryData([QUERY_KEYS.PROVIDER_STATUS, userAddress, false]);
      
      if (profile && legacySetters.setProfile) {
        legacySetters.setProfile(profile);
      }
      
      if (status && legacySetters.setStatus) {
        legacySetters.setStatus(status);
      }

      if (ssoData && legacySetters.setSSOData) {
        legacySetters.setSSOData(ssoData);
      }

      if (providerStatus && legacySetters.setProviderStatus) {
        legacySetters.setProviderStatus(providerStatus);
      }
    },

    // Synchronize data from legacy contexts to React Query
    syncFromLegacy: (userAddress, legacyData) => {
      if (legacyData.profile) {
        queryClient.setQueryData(QUERY_KEYS.USER.profile(userAddress), legacyData.profile);
      }
      
      if (legacyData.status) {
        queryClient.setQueryData(QUERY_KEYS.USER.status(userAddress), legacyData.status);
      }

      if (legacyData.ssoData) {
        queryClient.setQueryData([QUERY_KEYS.SSO_SESSION], legacyData.ssoData);
      }

      if (legacyData.providerStatus) {
        queryClient.setQueryData([QUERY_KEYS.PROVIDER_STATUS, userAddress, false], legacyData.providerStatus);
      }
    },
  };
};
