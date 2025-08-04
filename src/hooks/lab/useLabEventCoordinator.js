/**
 * Hook for coordinating manual lab updates with blockchain events
 * Prevents race conditions and duplicate API calls
 */
import { useCallback } from 'react'
import { useLabEvents } from '@/context/LabEventContext'
import devLog from '@/utils/dev/logger'

export function useLabEventCoordinator() {
  const { 
    updateLabCaches,
    smartLabInvalidation,
    setManualUpdateInProgress,
    isManualUpdateInProgress 
  } = useLabEvents();

  /**
   * Coordinated lab update - use this instead of direct API calls
   * when manually updating labs from the UI
   */
  const coordinatedLabUpdate = useCallback(async (updateFunction, labId = null, labData = null, action = null) => {
    // Check if an update is already in progress
    if (isManualUpdateInProgress) {
      devLog.warn('[LabEventCoordinator] Manual update already in progress, skipping...');
      return;
    }

    // Set flag to indicate manual update is in progress
    setManualUpdateInProgress(true);

    try {
      devLog.log('🚀 [LabEventCoordinator] Starting coordinated lab update:', { 
        labId,
        action,
        timestamp: new Date().toISOString()
      });

      // Execute the update function (API call, etc.)
      const result = await updateFunction();

      // Smart cache update using granular updates when possible
      devLog.log('♻️ [LabEventCoordinator] Updating caches...');
      await updateLabCaches(labId, labData, action, 'coordinated_manual_update');

      devLog.log('✅ [LabEventCoordinator] Cache update completed');

      return result;
    } catch (error) {
      devLog.error('Manual lab update failed:', error);
      throw error;
    } finally {
      // Clear the flag after a delay to allow events to settle
      setTimeout(() => {
        setManualUpdateInProgress(false);
      }, 1000);
    }
  }, [isManualUpdateInProgress, setManualUpdateInProgress, updateLabCaches]);

  /**
   * Coordinated cache refresh - use when immediate UI update is needed
   */
  const coordinatedRefresh = useCallback(async (labId = null) => {
    if (!isManualUpdateInProgress) {
      devLog.log('🔄 [LabEventCoordinator] Refreshing labs');
      await updateLabCaches(labId, null, null, 'manual_refresh');
    } else {
      devLog.log('Manual update in progress, skipping automatic refresh');
    }
  }, [updateLabCaches, isManualUpdateInProgress]);

  /**
   * Granular cache update for specific lab actions
   */
  const coordinatedGranularUpdate = useCallback((labId, labData, action) => {
    if (!isManualUpdateInProgress) {
      devLog.log('🎯 [LabEventCoordinator] Performing granular update:', { labId, action });
      smartLabInvalidation(labId, labData, action);
    } else {
      devLog.log('Manual update in progress, skipping granular update');
    }
  }, [smartLabInvalidation, isManualUpdateInProgress]);

  /**
   * Check if manual update is in progress
   */
  const isManualInProgress = useCallback(() => {
    return isManualUpdateInProgress;
  }, [isManualUpdateInProgress]);

  return {
    coordinatedLabUpdate,
    coordinatedRefresh,
    coordinatedGranularUpdate,
    isManualInProgress
  };
}
