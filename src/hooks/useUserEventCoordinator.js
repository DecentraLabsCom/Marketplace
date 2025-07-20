/**
 * Hook for coordinating manual user/provider updates with blockchain events
 * Prevents race conditions and duplicate API calls for user-related operations
 */
import { useCallback } from 'react';
import { useUser } from '@/context/UserContext';
import { useUserEvents } from '@/context/UserEventContext';
import devLog from '@/utils/logger';

export function useUserEventCoordinator() {
  const { refreshProviderStatus } = useUser();
  const { 
    invalidateUserCache, 
    scheduleUserUpdate,
    setManualUpdateInProgress,
    isManualUpdateInProgress 
  } = useUserEvents();

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
   */
  const coordinatedProviderRefresh = useCallback(() => {
    if (!isManualUpdateInProgress) {
      if (typeof refreshProviderStatus === 'function') {
        refreshProviderStatus();
      }
    } else {
      devLog.log('Manual user update in progress, skipping automatic refresh');
    }
  }, [refreshProviderStatus, isManualUpdateInProgress]);

  /**
   * Coordinated provider registration - handles both local state and blockchain events
   */
  const coordinatedProviderRegistration = useCallback(async (registrationFunction, userAccount) => {
    return coordinatedUserUpdate(async () => {
      // Execute the registration function (API/contract call)
      const result = await registrationFunction();
      
      // Immediately refresh provider status for better UX
      if (typeof refreshProviderStatus === 'function') {
        setTimeout(() => refreshProviderStatus(), 100);
      }
      
      return result;
    }, userAccount);
  }, [coordinatedUserUpdate, refreshProviderStatus]);

  /**
   * Coordinated provider update - handles provider information updates
   */
  const coordinatedProviderUpdate = useCallback(async (updateFunction, userAccount) => {
    return coordinatedUserUpdate(async () => {
      // Execute the update function (API/contract call)
      const result = await updateFunction();
      
      // Immediately refresh provider status for better UX
      if (typeof refreshProviderStatus === 'function') {
        setTimeout(() => refreshProviderStatus(), 100);
      }
      
      return result;
    }, userAccount);
  }, [coordinatedUserUpdate, refreshProviderStatus]);

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
