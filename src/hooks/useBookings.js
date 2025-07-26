import { useEffect, useState, useCallback, useRef } from 'react';
import { useUser } from '@/context/UserContext';
import { useBookings as useBookingContext } from '@/context/BookingContext';
import { useReservationEvents } from '@/context/BookingEventContext';
import devLog from '@/utils/logger';

/**
 * BOOKING HOOKS
 * 
 * This file unifies and parametrizes the following functionality:
 * - useContractEventUpdates
 * - useRealTimeBookingUpdates  
 * - useLabBookings
 * - useMinuteUpdates
 * 
 * Provides a consistent, parametrized interface for all booking operations
 */

// ===========================
// CONFIGURATION CONSTANTS
// ===========================

const UPDATE_STRATEGIES = {
  REAL_TIME: 'realTime',        // Immediate updates, precise timing
  PERIODIC: 'periodic',         // Fixed interval updates
  ON_DEMAND: 'onDemand',        // Manual refresh only
  HYBRID: 'hybrid'              // Smart combination of real-time + periodic
};

const DEFAULT_CONFIG = {
  strategy: UPDATE_STRATEGIES.HYBRID,
  interval: 60000,              // 1 minute for periodic updates
  enableContractEvents: true,   // Listen to blockchain events
  enableRealTimeUpdates: true,  // Use precise timing for booking state changes
  autoFetch: true,              // Fetch data on mount
  cacheTTL: 30000,             // 30 seconds cache validity
  enableDebugLogs: false        // Debug logging
};

// ===========================
// HOOK 1: USER BOOKINGS
// ===========================

/**
 * Unified hook for user bookings with parametrized update strategy
 * 
 * @param {Object} options - Configuration options
 * @param {string} options.strategy - Update strategy (realTime, periodic, onDemand, hybrid)
 * @param {number} options.interval - Update interval in ms (for periodic strategy)
 * @param {boolean} options.enableContractEvents - Enable blockchain event listening
 * @param {boolean} options.enableRealTimeUpdates - Enable precise timing updates
 * @param {boolean} options.autoFetch - Auto-fetch on mount
 * @param {boolean} options.enabled - Whether the hook is enabled
 * @returns {Object} User bookings state and actions
 */
export function useUserBookings(options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  const { address, isLoggedIn } = useUser();
  const { 
    userBookings, 
    refreshBookings, 
    userBookingsLoading,
    getProcessingBookings 
  } = useBookingContext();
  const { processingReservations } = useReservationEvents();
  
  const [forceUpdateTrigger, setForceUpdateTrigger] = useState(0);
  const [lastUpdateTime, setLastUpdateTime] = useState(0);
  const intervalRef = useRef(null);
  const timeoutRef = useRef(null);
  
  const log = useCallback((message, data = {}) => {
    if (config.enableDebugLogs) {
      devLog.log(`[useUserBookings:${config.strategy}] ${message}`, data);
    }
  }, [config.enableDebugLogs, config.strategy]);

  // ===========================
  // REAL-TIME UPDATE LOGIC
  // ===========================
  
  const scheduleNextRealTimeUpdate = useCallback(() => {
    if (!config.enableRealTimeUpdates || !isLoggedIn || !Array.isArray(userBookings) || userBookings.length === 0) {
      return;
    }

    const now = new Date();
    let nextUpdateTime = null;
    let needsContractSync = false;

    // Find the next moment when any booking changes state
    userBookings.forEach(booking => {
      if (!booking.start || !booking.end) return;
      
      const startTime = new Date(parseInt(booking.start) * 1000);
      const endTime = new Date(parseInt(booking.end) * 1000);
      
      if (startTime > now) {
        if (!nextUpdateTime || startTime < nextUpdateTime) {
          nextUpdateTime = startTime;
          needsContractSync = true;
        }
      } else if (now >= startTime && now < endTime) {
        if (!nextUpdateTime || endTime < nextUpdateTime) {
          nextUpdateTime = endTime;
          needsContractSync = false;
        }
      }
    });

    if (nextUpdateTime) {
      const timeUntilUpdate = Math.max(0, nextUpdateTime.getTime() - now.getTime());
      
      log('Scheduling real-time update', {
        nextUpdateTime: nextUpdateTime.toISOString(),
        timeUntilUpdate,
        needsContractSync
      });

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        log('Real-time update triggered');
        if (needsContractSync && refreshBookings) {
          refreshBookings();
        } else {
          setForceUpdateTrigger(prev => prev + 1);
        }
        scheduleNextRealTimeUpdate();
      }, timeUntilUpdate);
    }
  }, [config.enableRealTimeUpdates, isLoggedIn, userBookings, refreshBookings, log]);

  // ===========================
  // PERIODIC UPDATE LOGIC
  // ===========================
  
  const startPeriodicUpdates = useCallback(() => {
    if (!isLoggedIn || !address || !refreshBookings) return;
    
    log('Starting periodic updates', { interval: config.interval });
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    intervalRef.current = setInterval(() => {
      log('Periodic update triggered');
      refreshBookings();
      setLastUpdateTime(Date.now());
    }, config.interval);
  }, [isLoggedIn, address, refreshBookings, config.interval, log]);

  const stopPeriodicUpdates = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      log('Stopped periodic updates');
    }
  }, [log]);

  // ===========================
  // STRATEGY MANAGEMENT
  // ===========================
  
  useEffect(() => {
    if (!options.enabled && options.enabled !== undefined) {
      return;
    }

    switch (config.strategy) {
      case UPDATE_STRATEGIES.REAL_TIME:
        scheduleNextRealTimeUpdate();
        break;
        
      case UPDATE_STRATEGIES.PERIODIC:
        startPeriodicUpdates();
        break;
        
      case UPDATE_STRATEGIES.HYBRID:
        scheduleNextRealTimeUpdate();
        startPeriodicUpdates();
        break;
        
      case UPDATE_STRATEGIES.ON_DEMAND:
        // No automatic updates
        break;
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      stopPeriodicUpdates();
    };
  }, [config.strategy, scheduleNextRealTimeUpdate, startPeriodicUpdates, stopPeriodicUpdates, options.enabled]);

  // ===========================
  // AUTO-FETCH ON MOUNT
  // ===========================
  
  useEffect(() => {
    if (config.autoFetch && isLoggedIn && address && refreshBookings && userBookings.length === 0) {
      log('Auto-fetching user bookings on mount');
      refreshBookings();
    }
  }, [config.autoFetch, isLoggedIn, address, refreshBookings, userBookings.length, log]);

  // ===========================
  // CONTRACT EVENTS (if enabled)
  // ===========================
  
  useEffect(() => {
    if (!config.enableContractEvents || !processingReservations) return;
    
    log('Contract events monitoring enabled', { 
      processingCount: processingReservations.length 
    });
    
    // Force update when processing reservations change
    setForceUpdateTrigger(prev => prev + 1);
  }, [config.enableContractEvents, processingReservations, log]);

  // ===========================
  // RETURN API
  // ===========================
  
  return {
    // Data
    userBookings,
    loading: userBookingsLoading,
    processingBookings: getProcessingBookings ? getProcessingBookings() : [],
    
    // Actions
    refreshBookings,
    forceUpdate: () => setForceUpdateTrigger(prev => prev + 1),
    
    // Strategy controls
    startPeriodicUpdates,
    stopPeriodicUpdates,
    
    // Status
    lastUpdateTime,
    forceUpdateTrigger,
    strategy: config.strategy,
    isEnabled: options.enabled !== false,
    
    // Debug
    config: config.enableDebugLogs ? config : undefined
  };
}

// ===========================
// HOOK 2: LAB BOOKINGS
// ===========================

/**
 * Unified hook for lab-specific bookings with parametrized update strategy
 * 
 * @param {string|number} labId - The lab ID to fetch bookings for
 * @param {Object} options - Configuration options (same as useUserBookings)
 * @returns {Object} Lab bookings state and actions
 */
export function useLabBookings(labId, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  const normalizedLabId = labId?.toString();
  
  const { 
    fetchLabBookings, 
    getLabBookings, 
    isLabBookingsLoaded 
  } = useBookingContext();
  const { processingReservations } = useReservationEvents();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetchTime, setLastFetchTime] = useState(0);
  const [forceUpdateTrigger, setForceUpdateTrigger] = useState(0);
  const intervalRef = useRef(null);
  
  const log = useCallback((message, data = {}) => {
    if (config.enableDebugLogs) {
      devLog.log(`[useLabBookings:${config.strategy}:${normalizedLabId}] ${message}`, data);
    }
  }, [config.enableDebugLogs, config.strategy, normalizedLabId]);

  // Get current lab bookings
  const labBookings = getLabBookings(normalizedLabId);
  const isLoaded = isLabBookingsLoaded(normalizedLabId);

  // ===========================
  // FETCH LOGIC
  // ===========================
  
  const fetchBookings = useCallback(async (force = false) => {
    if (!normalizedLabId) {
      log('No labId provided');
      return [];
    }

    if (loading && !force) {
      log('Already loading, skipping');
      return getLabBookings(normalizedLabId);
    }

    const currentBookings = getLabBookings(normalizedLabId);
    if (!force && isLoaded && Array.isArray(currentBookings)) {
      log('Using cached data');
      return currentBookings;
    }

    try {
      setLoading(true);
      setError(null);
      
      log('Fetching lab bookings', { force });
      
      const bookings = await fetchLabBookings(normalizedLabId);
      setLastFetchTime(Date.now());
      
      log('Successfully fetched lab bookings', { count: bookings?.length });
      
      return bookings;
    } catch (err) {
      const errorMessage = err.message || 'Failed to fetch lab bookings';
      setError(errorMessage);
      log('Error fetching lab bookings', { error: errorMessage });
      throw err;
    } finally {
      setLoading(false);
    }
  }, [normalizedLabId, loading, getLabBookings, isLoaded, fetchLabBookings, log]);

  // ===========================
  // PERIODIC UPDATES
  // ===========================
  
  const startPeriodicUpdates = useCallback(() => {
    if (!normalizedLabId) return;
    
    log('Starting periodic updates', { interval: config.interval });
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    intervalRef.current = setInterval(() => {
      log('Periodic update triggered');
      fetchBookings(false);
    }, config.interval);
  }, [normalizedLabId, config.interval, fetchBookings, log]);

  const stopPeriodicUpdates = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      log('Stopped periodic updates');
    }
  }, [log]);

  // ===========================
  // STRATEGY MANAGEMENT
  // ===========================
  
  useEffect(() => {
    if (!options.enabled && options.enabled !== undefined) {
      return;
    }

    switch (config.strategy) {
      case UPDATE_STRATEGIES.PERIODIC:
      case UPDATE_STRATEGIES.HYBRID:
        startPeriodicUpdates();
        break;
        
      case UPDATE_STRATEGIES.REAL_TIME:
      case UPDATE_STRATEGIES.ON_DEMAND:
        // No periodic updates for these strategies
        break;
    }

    return () => {
      stopPeriodicUpdates();
    };
  }, [config.strategy, startPeriodicUpdates, stopPeriodicUpdates, options.enabled]);

  // ===========================
  // AUTO-FETCH ON MOUNT
  // ===========================
  
  useEffect(() => {
    if (config.autoFetch && normalizedLabId && !isLoaded) {
      log('Auto-fetching lab bookings on mount');
      fetchBookings(false);
    }
  }, [config.autoFetch, normalizedLabId, isLoaded, fetchBookings, log]);

  // ===========================
  // CONTRACT EVENTS
  // ===========================
  
  useEffect(() => {
    if (!config.enableContractEvents || !processingReservations) return;
    
    // Check if any processing reservation is for this lab
    const labProcessingReservations = processingReservations.filter(
      reservation => reservation.labId === normalizedLabId
    );
    
    if (labProcessingReservations.length > 0) {
      log('Contract events for this lab detected', { 
        count: labProcessingReservations.length 
      });
      setForceUpdateTrigger(prev => prev + 1);
    }
  }, [config.enableContractEvents, processingReservations, normalizedLabId, log]);

  // ===========================
  // RETURN API
  // ===========================
  
  return {
    // Data
    labBookings,
    loading,
    error,
    isLoaded,
    
    // Actions
    fetchBookings,
    refresh: () => fetchBookings(true),
    forceUpdate: () => setForceUpdateTrigger(prev => prev + 1),
    
    // Strategy controls
    startPeriodicUpdates,
    stopPeriodicUpdates,
    
    // Status
    lastFetchTime,
    forceUpdateTrigger,
    strategy: config.strategy,
    isEnabled: options.enabled !== false,
    labId: normalizedLabId,
    
    // Debug
    config: config.enableDebugLogs ? config : undefined
  };
}

// ===========================
// UTILITY EXPORTS
// ===========================

export { UPDATE_STRATEGIES };

export const createBookingConfig = (overrides = {}) => ({
  ...DEFAULT_CONFIG,
  ...overrides
});

// Preset configurations for common use cases
export const BOOKING_CONFIGS = {
  // High-frequency updates for active dashboards
  DASHBOARD: createBookingConfig({
    strategy: UPDATE_STRATEGIES.HYBRID,
    interval: 30000,
    enableRealTimeUpdates: true,
    enableContractEvents: true,
    enableDebugLogs: false
  }),
  
  // Low-frequency updates for background monitoring
  BACKGROUND: createBookingConfig({
    strategy: UPDATE_STRATEGIES.PERIODIC,
    interval: 300000, // 5 minutes
    enableRealTimeUpdates: false,
    enableContractEvents: true,
    enableDebugLogs: false
  }),
  
  // Manual-only updates for specific use cases
  MANUAL: createBookingConfig({
    strategy: UPDATE_STRATEGIES.ON_DEMAND,
    enableRealTimeUpdates: false,
    enableContractEvents: false,
    autoFetch: false,
    enableDebugLogs: false
  }),
  
  // Debug configuration with full logging
  DEBUG: createBookingConfig({
    strategy: UPDATE_STRATEGIES.HYBRID,
    interval: 10000,
    enableRealTimeUpdates: true,
    enableContractEvents: true,
    enableDebugLogs: true
  })
};
