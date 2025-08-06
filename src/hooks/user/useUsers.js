/**
 * React Query Hooks for User-related data
 * Uses simple hooks with composed services and cache-extracting hooks
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { userServices } from '@/services/user/userServices'
import { QUERY_KEYS } from '@/utils/hooks/queryKeys'
import { createSSRSafeQuery } from '@/utils/ssrSafe'
import { devLog } from '@/utils/dev/logger'

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
    queryFn: createSSRSafeQuery(
      async () => {
        if (!identifier) {
          // Return safe default for empty identifier
          return {
            isLabProvider: false,
            providerName: null,
            checked: true,
            wallet: null
          };
        }

        // For now, only support wallet addresses with the composed service
        // Email support can be added later if needed
        if (isEmail) {
          throw new Error('Email-based provider lookup not yet supported in composed service');
        }

        // Use the composed service for complete provider data
        const result = await userServices.fetchProviderStatusComposed(identifier);
        
        devLog.log('🔍 useProviderStatusQuery Final Result:', result);
        
        return result;
      },
      { isLabProvider: false, providerName: null, checked: true, wallet: null } // SSR fallback
    ),
    staleTime: 6 * 60 * 60 * 1000, // 6 hours
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    retry: 1,
    enabled: Boolean(identifier),
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
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
// === GRANULAR CACHE UPDATES ===
// ===============================

/**
 * Hook for user/provider granular cache update utilities
 * Provides granular cache manipulation functions for users and providers
 * @returns {Object} User cache update functions
 */
export const useUserCacheUpdates = () => {
  const queryClient = useQueryClient();

  /**
   * Add user to providers list cache (if it exists)
   * @param {Object} userData - User data to add
   */
  const addUserToProvidersCache = (userData) => {
    if (!userData?.address) return;

    try {
      queryClient.setQueryData(QUERY_KEYS.PROVIDER.all, (oldData) => {
        if (!oldData) return oldData;
        
        // Check if user already exists to avoid duplicates
        const existingIndex = oldData.findIndex(p => p.address === userData.address);
        if (existingIndex !== -1) {
          return oldData; // Already exists, no need to add
        }

        return [...oldData, userData];
      });
      devLog.log('✅ Added user to providers cache:', userData.address);
    } catch (error) {
      devLog.warn('⚠️ Failed to add user to providers cache:', error);
    }
  };

  /**
   * Update user in providers list cache
   * @param {Object} userData - Updated user data
   */
  const updateUserInProvidersCache = (userData) => {
    if (!userData?.address) return;

    try {
      queryClient.setQueryData(QUERY_KEYS.PROVIDER.all, (oldData) => {
        if (!oldData) return oldData;

        return oldData.map(provider => 
          provider.address === userData.address 
            ? { ...provider, ...userData }
            : provider
        );
      });
      devLog.log('✅ Updated user in providers cache:', userData.address);
    } catch (error) {
      devLog.warn('⚠️ Failed to update user in providers cache:', error);
    }
  };

  /**
   * Remove user from providers list cache
   * @param {string} userAddress - User address to remove
   */
  const removeUserFromProvidersCache = (userAddress) => {
    if (!userAddress) return;

    try {
      queryClient.setQueryData(QUERY_KEYS.PROVIDER.all, (oldData) => {
        if (!oldData) return oldData;
        return oldData.filter(provider => provider.address !== userAddress);
      });
      devLog.log('✅ Removed user from providers cache:', userAddress);
    } catch (error) {
      devLog.warn('⚠️ Failed to remove user from providers cache:', error);
    }
  };

  /**
   * Update user profile in cache
   * @param {string} userAddress - User address
   * @param {Object} profileData - Updated profile data
   */
  const updateUserProfileCache = (userAddress, profileData) => {
    if (!userAddress || !profileData) return;

    try {
      queryClient.setQueryData(QUERY_KEYS.USER.profile(userAddress), (oldData) => {
        if (!oldData) return profileData;
        return { ...oldData, ...profileData };
      });
      devLog.log('✅ Updated user profile cache:', userAddress);
    } catch (error) {
      devLog.warn('⚠️ Failed to update user profile cache:', error);
    }
  };

  /**
   * Update user status in cache
   * @param {string} userAddress - User address
   * @param {Object} statusData - Updated status data
   */
  const updateUserStatusCache = (userAddress, statusData) => {
    if (!userAddress || !statusData) return;

    try {
      queryClient.setQueryData(QUERY_KEYS.USER.status(userAddress), (oldData) => {
        if (!oldData) return statusData;
        return { ...oldData, ...statusData };
      });
      devLog.log('✅ Updated user status cache:', userAddress);
    } catch (error) {
      devLog.warn('⚠️ Failed to update user status cache:', error);
    }
  };

  /**
   * Update provider data in cache
   * @param {string} providerId - Provider ID (user address)
   * @param {Object} providerData - Updated provider data
   */
  const updateProviderDataCache = (providerId, providerData) => {
    if (!providerId || !providerData) return;

    try {
      queryClient.setQueryData(QUERY_KEYS.PROVIDER.data(providerId), (oldData) => {
        if (!oldData) return providerData;
        return { ...oldData, ...providerData };
      });
      devLog.log('✅ Updated provider data cache:', providerId);
    } catch (error) {
      devLog.warn('⚠️ Failed to update provider data cache:', error);
    }
  };

  /**
   * Smart user cache update - tries granular first, falls back to invalidation
   * @param {string} userAddress - User address
   * @param {Object} userData - User data for granular updates
   * @param {string} action - Action type: 'add', 'remove', 'update'
   * @param {string} [context] - Context: 'user', 'provider', or 'both'
   */
  const smartUserInvalidation = (userAddress, userData = null, action = 'update', context = 'both') => {
    if (!userAddress) return;

    try {
      switch (action) {
        case 'add':
          if (context === 'provider' || context === 'both') {
            addUserToProvidersCache(userData);
          }
          if (userData) {
            updateUserProfileCache(userAddress, userData);
            updateUserStatusCache(userAddress, { isProvider: true });
          }
          break;

        case 'remove':
          if (context === 'provider' || context === 'both') {
            removeUserFromProvidersCache(userAddress);
          }
          break;

        case 'update':
          if (context === 'provider' || context === 'both') {
            updateUserInProvidersCache(userData);
            updateProviderDataCache(userAddress, userData);
          }
          if (context === 'user' || context === 'both') {
            updateUserProfileCache(userAddress, userData);
            updateUserStatusCache(userAddress, userData);
          }
          break;

        default:
          devLog.warn('⚠️ Unknown action for smartUserInvalidation:', action);
      }

      devLog.log(`✅ Smart user cache update completed: ${action} for ${userAddress}`);
    } catch (error) {
      devLog.warn('⚠️ Smart user cache update failed, consider invalidation:', error);
      throw error; // Re-throw so caller can handle fallback
    }
  };

  return {
    addUserToProvidersCache,
    updateUserInProvidersCache,
    removeUserFromProvidersCache,
    updateUserProfileCache,
    updateUserStatusCache,
    updateProviderDataCache,
    smartUserInvalidation
  };
};
