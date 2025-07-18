/**
 * Hook for coordinating manual lab updates with blockchain events
 * Prevents race conditions and duplicate API calls
 */
import { useCallback } from 'react';
import { useLabs } from '@/context/LabContext';
import { useLabEvents } from '@/context/LabEventContext';

export function useLabEventCoordinator() {
  const { clearCacheAndRefresh, updateLabInState } = useLabs();
  const { 
    invalidateLabCache, 
    scheduleLabsUpdate, 
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
      console.warn('[LabEventCoordinator] Manual update already in progress, skipping...');
      return;
    }

    // Set flag to indicate manual update is in progress
    setManualUpdateInProgress(true);

    try {
      // Execute the update function (API call, etc.)
      const result = await updateFunction();

      // Invalidate cache for the specific lab or all labs
      if (labId) {
        invalidateLabCache(labId);
      } else {
        invalidateLabCache();
      }

      // Schedule a refresh after manual update
      scheduleLabsUpdate(200); // Short delay to allow for any pending events

      return result;
    } catch (error) {
      console.error('Manual lab update failed:', error);
      throw error;
    } finally {
      // Clear the flag after a delay to allow events to settle
      setTimeout(() => {
        setManualUpdateInProgress(false);
      }, 1000);
    }
  }, [isManualUpdateInProgress, setManualUpdateInProgress, invalidateLabCache, scheduleLabsUpdate]);

  /**
   * Coordinated cache refresh - use when immediate UI update is needed
   */
  const coordinatedRefresh = useCallback(() => {
    if (!isManualUpdateInProgress) {
      clearCacheAndRefresh();
    } else {
      console.log('Manual update in progress, skipping automatic refresh');
    }
  }, [clearCacheAndRefresh, isManualUpdateInProgress]);

  /**
   * Check if manual update is in progress
   */
  // Función para verificar si hay una actualización manual en progreso
  const isManualInProgress = useCallback(() => {
    return isManualUpdateInProgress;
  }, [isManualUpdateInProgress]);

  return {
    coordinatedLabUpdate,
    coordinatedRefresh,
    isManualInProgress,
    updateLabInState
  };
}
