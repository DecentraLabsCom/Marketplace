/**
 * Hook for coordinating manual lab updates with blockchain events
 * Prevents race conditions and duplicate API calls
 */
import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLabEvents } from '@/context/LabEventContext'
import { QUERY_KEYS } from '@/utils/queryKeys'
import devLog from '@/utils/dev/logger'

export function useLabEventCoordinator() {
  const queryClient = useQueryClient();
  const { 
    invalidateAllLabCaches, 
    setManualUpdateInProgress,
    isManualUpdateInProgress 
  } = useLabEvents();

  /**
   * Coordinated lab update - use this instead of direct API calls
   * when manually updating labs from the UI
   */
  const coordinatedLabUpdate = useCallback(async (updateFunction, labId = null) => {
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
        timestamp: new Date().toISOString()
      });

      // Execute the update function (API call, etc.)
      const result = await updateFunction();

      // Invalidate relevant React Query caches
      devLog.log('♻️ [LabEventCoordinator] Invalidating caches...');
      await invalidateAllLabCaches(labId, 'coordinated_manual_update');

      devLog.log('✅ [LabEventCoordinator] Cache invalidation completed');

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
  }, [isManualUpdateInProgress, setManualUpdateInProgress, invalidateAllLabCaches]);

  /**
   * Coordinated cache refresh - use when immediate UI update is needed
   */
  const coordinatedRefresh = useCallback(async (labId = null) => {
    if (!isManualUpdateInProgress) {
      devLog.log('🔄 [LabEventCoordinator] Refreshing labs');
      await invalidateAllLabCaches(labId, 'manual_refresh');
    } else {
      devLog.log('Manual update in progress, skipping automatic refresh');
    }
  }, [invalidateAllLabCaches, isManualUpdateInProgress]);

  /**
   * Check if manual update is in progress
   */
  const isManualInProgress = useCallback(() => {
    return isManualUpdateInProgress;
  }, [isManualUpdateInProgress]);

  return {
    coordinatedLabUpdate,
    coordinatedRefresh,
    isManualInProgress
  };
}
