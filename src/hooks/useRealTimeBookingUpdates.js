import { useEffect, useState, useCallback } from 'react';
import devLog from '@/utils/logger';

/**
 * Hybrid hook for efficient active booking updates.
 * Combines:
 * 1. Fast local comparisons (no fetch)
 * 2. Precise updates at key moments
 * 3. Contract event synchronization
 * 
 * @param {Array} userBookings - User bookings array
 * @param {boolean} isLoggedIn - Whether the user is logged in
 * @param {Function} refreshBookings - Function to refresh from contract (optional)
 * @returns {number} forceUpdateTrigger - Value that changes when update is needed
 */
export function useRealTimeBookingUpdates(userBookings, isLoggedIn = true, refreshBookings = null) {
  const [forceUpdateTrigger, setForceUpdateTrigger] = useState(0);
  
  const scheduleNextUpdate = useCallback(() => {
    if (!isLoggedIn || !Array.isArray(userBookings) || userBookings.length === 0) {
      return;
    }

    const now = new Date();
    let nextUpdateTime = null;
    let needsContractSync = false;

    // Find the next moment when any booking changes state
    userBookings.forEach(booking => {
      if (!booking.start || !booking.end) return;
      
      // Convert Unix timestamps to Date objects
      const startTime = new Date(parseInt(booking.start) * 1000);
      const endTime = new Date(parseInt(booking.end) * 1000);
      
      // If the booking will start in the future
      if (startTime > now) {
        if (!nextUpdateTime || startTime < nextUpdateTime) {
          nextUpdateTime = startTime;
          needsContractSync = true; // At start we need to verify with contract
        }
      }
      // If the booking is active and about to end
      else if (now >= startTime && now < endTime) {
        if (!nextUpdateTime || endTime < nextUpdateTime) {
          nextUpdateTime = endTime;
          needsContractSync = false; // At the end we only need local update
        }
      }
    });

    // Schedule the update exactly when the state changes
    if (nextUpdateTime) {
      const timeUntilUpdate = nextUpdateTime.getTime() - now.getTime();
      
      devLog.log(`⏰ Next booking update in ${Math.round(timeUntilUpdate / 1000)}s`, {
        time: nextUpdateTime.toLocaleString(),
        strategy: needsContractSync ? 'contract-sync' : 'local-update'
      });
      
      // Add a small delay (1 second) to ensure the change is detected
      const timeout = setTimeout(async () => {
        // If we need to sync with contract (e.g., at booking start)
        if (needsContractSync && refreshBookings) {
          devLog.log('🔄 Contract sync for booking state change');
          await refreshBookings();
        }
        
        // Force re-render to update UI
        setForceUpdateTrigger(prev => prev + 1);
        
        // Schedule the next update recursively
        scheduleNextUpdate();
      }, timeUntilUpdate + 1000);

      return timeout;
    }
  }, [userBookings, isLoggedIn, refreshBookings]);

  useEffect(() => {
    const timeout = scheduleNextUpdate();
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [scheduleNextUpdate]);

  return forceUpdateTrigger;
}

/**
 * Simplified but more efficient hook for regular updates
 * Only does polling when absolutely necessary
 * @param {boolean} isLoggedIn 
 * @param {Array} labs 
 * @param {Function} refreshBookings - Function to refresh from contract
 * @returns {number} forceUpdateTrigger
 */
export function useMinuteUpdates(isLoggedIn, labs, refreshBookings = null) {
  const [forceUpdateTrigger, setForceUpdateTrigger] = useState(0);
  const [lastSync, setLastSync] = useState(0);
  
  useEffect(() => {
    if (!isLoggedIn || !labs?.length) return;

    // Hybrid strategy: 
    // 1. Local updates every minute (no fetch)
    // 2. Contract sync every 5 minutes (with fetch)
    
    const interval = setInterval(async () => {
      const now = Date.now();
      const minutesSinceLastSync = (now - lastSync) / (1000 * 60);
      
      // Every 5 minutes, sync with contract
      if (minutesSinceLastSync >= 5 && refreshBookings) {
        devLog.log('🔄 Periodic contract sync (5min)');
        await refreshBookings();
        setLastSync(now);
      }
      
      // Always force re-render for local checks
      setForceUpdateTrigger(prev => prev + 1);
    }, 60000); // Every minute

    return () => clearInterval(interval);
  }, [isLoggedIn, labs, refreshBookings, lastSync]);

  return forceUpdateTrigger;
}

/**
 * Hook that syncs with contract events for maximum efficiency
 * Uses ReservationEventContext for immediate updates
 * @param {boolean} isLoggedIn 
 * @param {Array} labs 
 * @returns {number} forceUpdateTrigger
 */
export function useContractEventUpdates(isLoggedIn, labs) {
  const [forceUpdateTrigger, setForceUpdateTrigger] = useState(0);
  
  // This hook will automatically activate when ReservationEventContext
  // detects events like BookingCreated, BookingCanceled, etc.
  // We only need to force re-render when labs change
  useEffect(() => {
    if (isLoggedIn && labs?.length) {
      setForceUpdateTrigger(prev => prev + 1);
    }
  }, [isLoggedIn, labs]);

  return forceUpdateTrigger;
}
