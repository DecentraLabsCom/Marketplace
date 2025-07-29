/**
 * Hook for coordinating manual user/provider updates with blockchain events
 * Prevents race conditions and duplicate API calls for user-related operations
 * Updated to use React Query hooks from unified useUsers.js
 */
import { useCallback } from 'react'
import { useUser } from '@/context/UserContext'
import { useUserEvents } from '@/context/UserEventContext'
import { useRefreshProviderStatusMutation, useCacheInvalidation } from '@/hooks/user/useUsers'
import devLog from '@/utils/dev/logger'

export function useUserEventCoordinator() {
  const { address } = useUser();
  const { 
    invalidateUserCache, 
    scheduleUserUpdate,
    setManualUpdateInProgress,
    isManualUpdateInProgress 
  } = useUserEvents();

  // React Query hooks for better cache management
  const { 
    invalidateProviderStatus,
    invalidateAllUserData 
  } = useCacheInvalidation();
  
  const refreshProviderStatusMutation = useRefreshProviderStatusMutation();

  /**
   * Coordinated user update - use this instead of direct API calls
   * when manually updating user/provider data from the UI
   */
  const coordinatedUserUpdate = useCallback(async (updateFunction, userId = null) => {
    // Check if an update is already in progress
    if (isManualUpdateInProgress) {
      devLog.warn('[UserEventCoordinator] Manual update already in progress, skipping...');
      return;
    }

    // Set flag to indicate manual update is in progress
    setManualUpdateInProgress(true);

    try {
      // Execute the update function (API call, transaction, etc.)
      const result = await updateFunction();

      // Invalidate cache for the specific user or all user data
      if (userId) {
        invalidateUserCache(userId);
      } else {
        invalidateUserCache();
      }

      // Schedule a refresh after manual update
      scheduleUserUpdate(200); // Short delay to allow for any pending events

      return result;
    } catch (error) {
      devLog.error('Manual user update failed:', error);
      throw error;
    } finally {
      // Clear the flag after a delay to allow events to settle
      setTimeout(() => {
        setManualUpdateInProgress(false);
      }, 1000);
    }
  }, [isManualUpdateInProgress, setManualUpdateInProgress, invalidateUserCache, scheduleUserUpdate]);

  /**
   * Coordinated provider status refresh - use when immediate UI updates are needed
   * Now uses React Query mutation for better error handling and cache management
   */
  const coordinatedProviderRefresh = useCallback(async () => {
    if (!isManualUpdateInProgress && address) {
      try {
        await refreshProviderStatusMutation.mutateAsync({ 
          identifier: address, 
          isEmail: false 
        });
        devLog.log(`✅ [UserEventCoordinator] Provider status refreshed for ${address}`);
      } catch (error) {
        devLog.error('❌ [UserEventCoordinator] Provider refresh failed:', error);
      }
    } else {
      devLog.log('Manual user update in progress or no address, skipping automatic refresh');
    }
  }, [address, refreshProviderStatusMutation, isManualUpdateInProgress]);

  /**
   * Coordinated provider registration - handles both local state and blockchain events
   * Enhanced with React Query cache invalidation
   */
  const coordinatedProviderRegistration = useCallback(async (registrationFunction, userAccount) => {
    return coordinatedUserUpdate(async () => {
      // Execute the registration function (API/contract call)
      const result = await registrationFunction();
      
      // Invalidate relevant React Query caches
      if (userAccount) {
        invalidateProviderStatus(userAccount, false);
        invalidateAllUserData(userAccount);
      }
      
      // Also refresh via mutation for immediate feedback
      if (userAccount) {
        setTimeout(async () => {
          try {
            await refreshProviderStatusMutation.mutateAsync({ 
              identifier: userAccount, 
              isEmail: false 
            });
          } catch (error) {
            devLog.error('Post-registration refresh failed:', error);
          }
        }, 100);
      }
      
      return result;
    }, userAccount);
  }, [coordinatedUserUpdate, invalidateProviderStatus, invalidateAllUserData, refreshProviderStatusMutation]);

  /**
   * Coordinated provider update - handles provider information updates
   * Enhanced with React Query cache invalidation
   */
  const coordinatedProviderUpdate = useCallback(async (updateFunction, userAccount) => {
    return coordinatedUserUpdate(async () => {
      // Execute the update function (API/contract call)
      const result = await updateFunction();
      
      // Invalidate relevant React Query caches
      if (userAccount) {
        invalidateProviderStatus(userAccount, false);
        invalidateAllUserData(userAccount);
      }
      
      // Also refresh via mutation for immediate feedback
      if (userAccount) {
        setTimeout(async () => {
          try {
            await refreshProviderStatusMutation.mutateAsync({ 
              identifier: userAccount, 
              isEmail: false 
            });
          } catch (error) {
            devLog.error('Post-update refresh failed:', error);
          }
        }, 100);
      }
      
      return result;
    }, userAccount);
  }, [coordinatedUserUpdate, invalidateProviderStatus, invalidateAllUserData, refreshProviderStatusMutation]);

  /**
   * Check if manual user update is in progress
   */
  const isManualUserInProgress = useCallback(() => {
    return isManualUpdateInProgress;
  }, [isManualUpdateInProgress]);

  return {
    coordinatedUserUpdate,
    coordinatedProviderRefresh,
    coordinatedProviderRegistration,
    coordinatedProviderUpdate,
    isManualUserInProgress
  };
}
