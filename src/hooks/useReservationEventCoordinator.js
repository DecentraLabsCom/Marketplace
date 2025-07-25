/**
 * Hook for coordinating manual reservation updates with blockchain events
 * Prevents race conditions and duplicate API calls for booking-related operations
 */
import { useCallback } from 'react';
import { useBookings } from '@/context/BookingContext';
import { useReservationEvents } from '@/context/BookingEventContext';
import devLog from '@/utils/logger';

export function useReservationEventCoordinator() {
  const { fetchUserBookings, removeBooking } = useBookings();
  const { 
    invalidateBookingCache, 
    scheduleBookingUpdate,
    updateAllRelevantBookings,
    updateAllLabBookings,
    setManualUpdateInProgress,
    isManualUpdateInProgress 
  } = useReservationEvents();

  /**
   * Coordinated reservation update - use this instead of direct API calls
   * when manually updating bookings/reservations from the UI
   */
  const coordinatedReservationUpdate = useCallback(async (updateFunction, reservationKey = null, labId = null) => {
    // Check if an update is already in progress
    if (isManualUpdateInProgress) {
      devLog.warn('[ReservationEventCoordinator] Manual update already in progress, skipping...');
      return;
    }

    // Set flag to indicate manual update is in progress
    setManualUpdateInProgress(true);

    try {
      // Execute the update function (API call, transaction, etc.)
      const result = await updateFunction();

      // Invalidate cache for the specific reservation or all bookings
      if (reservationKey) {
        invalidateBookingCache(reservationKey);
      } else {
        invalidateBookingCache();
      }

      // Ensure cross-user propagation after manual update
      if (labId) {
        await updateAllRelevantBookings(labId, 'coordinated_manual_update');
      } else {
        // If no specific labId, update all lab bookings to ensure cross-user propagation
        await updateAllLabBookings('coordinated_manual_update_all');
      }

      return result;
    } catch (error) {
      devLog.error('Manual reservation update failed:', error);
      throw error;
    } finally {
      // Clear the flag after a delay to allow events to settle
      setTimeout(() => {
        setManualUpdateInProgress(false);
      }, 1000);
    }
  }, [isManualUpdateInProgress, setManualUpdateInProgress, invalidateBookingCache, updateAllRelevantBookings, updateAllLabBookings]);

  /**
   * Coordinated booking refresh - use when immediate UI updates for bookings are needed
   */
  const coordinatedBookingRefresh = useCallback(() => {
    if (!isManualUpdateInProgress) {
      fetchUserBookings(true);
    } else {
      devLog.log('Manual booking update in progress, skipping automatic refresh');
    }
  }, [fetchUserBookings, isManualUpdateInProgress]);

  /**
   * Coordinated booking cancellation - handles both local state and blockchain events
   */
  const coordinatedBookingCancellation = useCallback(async (cancelFunction, reservationKey, labId = null) => {
    return coordinatedReservationUpdate(async () => {
      // Execute the cancellation function (API/contract call)
      const result = await cancelFunction();
      
      // Immediately update local state for better UX
      removeBooking(reservationKey);
      
      return result;
    }, reservationKey, labId);
  }, [coordinatedReservationUpdate, removeBooking]);

  /**
   * Manual refresh with cross-user propagation
   */
  const refreshAllBookings = useCallback(async (labId = null) => {
    devLog.log('🔄 [ReservationEventCoordinator] Manual refresh requested:', { labId });
    
    try {
      if (labId) {
        await updateAllRelevantBookings(labId, 'manual_refresh');
      } else {
        await updateAllLabBookings('manual_refresh_all');
      }
      
      devLog.log('✅ [ReservationEventCoordinator] Manual refresh completed');
    } catch (error) {
      devLog.error('❌ [ReservationEventCoordinator] Manual refresh failed:', error);
      throw error;
    }
  }, [updateAllRelevantBookings, updateAllLabBookings]);

  /**
   * Check if manual booking update is in progress
   */
  const isManualBookingInProgress = useCallback(() => {
    return isManualUpdateInProgress;
  }, [isManualUpdateInProgress]);

  /**
   * Invalidate all bookings for a specific lab (used when lab is deleted)
   */
  const invalidateLabBookings = useCallback((labId) => {
    devLog.log('🗑️ [ReservationEventCoordinator] Invalidating bookings for deleted lab:', labId);
    invalidateBookingCache(`lab_${labId}`);
  }, [invalidateBookingCache]);

  /**
   * Invalidate user bookings that reference a deleted lab
   */
  const invalidateUserBookingsByLab = useCallback(async (labId) => {
    devLog.log('🗑️ [ReservationEventCoordinator] Invalidating user bookings for deleted lab:', labId);
    
    // Trigger a forced refresh of user bookings to remove references to deleted lab
    await coordinatedReservationUpdate(async () => {
      // Force a complete refresh of user bookings
      fetchUserBookings(true);
      return { success: true, action: 'lab_deletion_cleanup' };
    }, null, labId);
  }, [coordinatedReservationUpdate, fetchUserBookings]);

  return {
    coordinatedReservationUpdate,
    coordinatedBookingRefresh,
    coordinatedBookingCancellation,
    refreshAllBookings,
    isManualBookingInProgress,
    invalidateLabBookings,
    invalidateUserBookingsByLab
  };
}
