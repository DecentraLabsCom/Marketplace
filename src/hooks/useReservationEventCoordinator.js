/**
 * Hook for coordinating manual reservation updates with blockchain events
 * Prevents race conditions and duplicate API calls for booking-related operations
 */
import { useCallback } from 'react';
import { useLabs } from '@/context/LabContext';
import { useReservationEvents } from '@/context/ReservationEventContext';
import devLog from '@/utils/logger';

export function useReservationEventCoordinator() {
  const { fetchBookings, removeCanceledBooking } = useLabs();
  const { 
    invalidateBookingCache, 
    scheduleBookingUpdate,
    setManualUpdateInProgress,
    isManualUpdateInProgress 
  } = useReservationEvents();

  /**
   * Coordinated reservation update - use this instead of direct API calls
   * when manually updating bookings/reservations from the UI
   */
  const coordinatedReservationUpdate = useCallback(async (updateFunction, reservationKey = null) => {
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

      // Schedule a refresh after manual update
      scheduleBookingUpdate(200); // Short delay to allow for any pending events

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
  }, [isManualUpdateInProgress, setManualUpdateInProgress, invalidateBookingCache, scheduleBookingUpdate]);

  /**
   * Coordinated booking refresh - use when immediate UI updates for bookings are needed
   */
  const coordinatedBookingRefresh = useCallback(() => {
    if (!isManualUpdateInProgress) {
      fetchBookings();
    } else {
      devLog.log('Manual booking update in progress, skipping automatic refresh');
    }
  }, [fetchBookings, isManualUpdateInProgress]);

  /**
   * Coordinated booking cancellation - handles both local state and blockchain events
   */
  const coordinatedBookingCancellation = useCallback(async (cancelFunction, reservationKey) => {
    return coordinatedReservationUpdate(async () => {
      // Execute the cancellation function (API/contract call)
      const result = await cancelFunction();
      
      // Immediately update local state for better UX
      removeCanceledBooking(reservationKey);
      
      return result;
    }, reservationKey);
  }, [coordinatedReservationUpdate, removeCanceledBooking]);

  /**
   * Check if manual booking update is in progress
   */
  const isManualBookingInProgress = useCallback(() => {
    return isManualUpdateInProgress;
  }, [isManualUpdateInProgress]);

  return {
    coordinatedReservationUpdate,
    coordinatedBookingRefresh,
    coordinatedBookingCancellation,
    isManualBookingInProgress
  };
}
