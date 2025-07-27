/**
 * Hook for coordinating manual reservation updates with blockchain events
 * Prevents race conditions and duplicate API calls for booking-related operations
 */
import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { QUERY_KEYS } from '@/utils/queryKeys'
import devLog from '@/utils/dev/logger'

export function useReservationEventCoordinator() {
  const queryClient = useQueryClient();
  const [isManualUpdateInProgress, setManualUpdateInProgress] = useState(false);

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
      devLog.log('🚀 [ReservationEventCoordinator] Starting coordinated reservation update:', { 
        reservationKey, 
        labId,
        timestamp: new Date().toISOString()
      });

      // Execute the update function (API call, transaction, etc.)
      const result = await updateFunction();

      // Invalidate all relevant React Query caches
      devLog.log('♻️ [ReservationEventCoordinator] Invalidating caches...');
      
      // Invalidate user bookings
      await queryClient.invalidateQueries({ 
        queryKey: [QUERY_KEYS.USER_BOOKINGS]
      });

      // If labId specified, invalidate lab bookings
      if (labId) {
        await queryClient.invalidateQueries({ 
          queryKey: [QUERY_KEYS.LAB_BOOKINGS, labId.toString()]
        });
      } else {
        // Invalidate all lab bookings to ensure cross-user propagation
        await queryClient.invalidateQueries({ 
          queryKey: [QUERY_KEYS.LAB_BOOKINGS]
        });
      }

      devLog.log('✅ [ReservationEventCoordinator] Cache invalidation completed');

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
  }, [isManualUpdateInProgress, setManualUpdateInProgress, queryClient]);

  /**
   * Coordinated booking refresh - use when immediate UI updates for bookings are needed
   */
  const coordinatedBookingRefresh = useCallback(() => {
    if (!isManualUpdateInProgress) {
      devLog.log('🔄 [ReservationEventCoordinator] Refreshing all bookings');
      queryClient.invalidateQueries({ 
        queryKey: [QUERY_KEYS.USER_BOOKINGS]
      });
    } else {
      devLog.log('Manual booking update in progress, skipping automatic refresh');
    }
  }, [queryClient, isManualUpdateInProgress]);

  /**
   * Coordinated booking cancellation - handles both local state and blockchain events
   */
  const coordinatedBookingCancellation = useCallback(async (cancelFunction, reservationKey, labId = null) => {
    return coordinatedReservationUpdate(async () => {
      // Execute the cancellation function (API/contract call)
      const result = await cancelFunction();
      
      devLog.log('🗑️ [ReservationEventCoordinator] Booking cancelled:', { reservationKey, labId });
      
      return result;
    }, reservationKey, labId);
  }, [coordinatedReservationUpdate]);

  /**
   * Manual refresh with cross-user propagation
   */
  const refreshAllBookings = useCallback(async (labId = null) => {
    devLog.log('🔄 [ReservationEventCoordinator] Manual refresh requested:', { labId });
    
    try {
      if (labId) {
        // Refresh specific lab bookings
        await queryClient.invalidateQueries({ 
          queryKey: [QUERY_KEYS.LAB_BOOKINGS, labId.toString()]
        });
      } else {
        // Refresh all bookings
        await queryClient.invalidateQueries({ 
          queryKey: [QUERY_KEYS.USER_BOOKINGS]
        });
        await queryClient.invalidateQueries({ 
          queryKey: [QUERY_KEYS.LAB_BOOKINGS]
        });
      }
      
      devLog.log('✅ [ReservationEventCoordinator] Manual refresh completed');
    } catch (error) {
      devLog.error('❌ [ReservationEventCoordinator] Manual refresh failed:', error);
      throw error;
    }
  }, [queryClient]);

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
    queryClient.invalidateQueries({ 
      queryKey: [QUERY_KEYS.LAB_BOOKINGS, labId.toString()]
    });
  }, [queryClient]);

  /**
   * Invalidate user bookings that reference a deleted lab
   */
  const invalidateUserBookingsByLab = useCallback(async (labId) => {
    devLog.log('🗑️ [ReservationEventCoordinator] Invalidating user bookings for deleted lab:', labId);
    
    // Trigger a forced refresh of user bookings to remove references to deleted lab
    await coordinatedReservationUpdate(async () => {
      // Force a complete refresh of user bookings
      await queryClient.invalidateQueries({ 
        queryKey: [QUERY_KEYS.USER_BOOKINGS]
      });
      return { success: true, action: 'lab_deletion_cleanup' };
    }, null, labId);
  }, [coordinatedReservationUpdate, queryClient]);

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
