"use client";
import { useState, useEffect, useCallback, useRef } from 'react';
import { useUser } from '@/context/UserContext';
import { useBookingEvents } from '@/context/BookingEventContext';
import devLog from '@/utils/logger';
import { createOptimizedContext, useMemoizedValue, useDebounced } from '@/utils/optimizedContext';
import { cacheManager, CACHE_TTL } from '@/utils/cacheManager';
import { deduplicatedFetch } from '@/utils/requestDeduplication';
import { 
  useErrorHandler, 
  createBlockchainError,
  ErrorSeverity,
  ErrorCategory 
} from '@/utils/errorBoundaries';

// Create optimized context for bookings
const { Provider: OptimizedBookingProvider, useContext: useBookingContext } = createOptimizedContext('BookingContext');

function BookingDataCore({ children }) {
  // Enhanced state management for both user and lab bookings
  const [userBookings, setUserBookings] = useState([]);
  const [labBookings, setLabBookings] = useState(new Map()); // Map<labId, bookings[]>
  const [userBookingsLoading, setUserBookingsLoading] = useState(false);
  const [lastUserBookingsFetch, setLastUserBookingsFetch] = useState(0);

  // Use refs to avoid dependency issues in useEffect
  const userBookingsLoadingRef = useRef(false);
  const lastUserBookingsFetchRef = useRef(0);
  
  // Keep refs in sync
  userBookingsLoadingRef.current = userBookingsLoading;
  lastUserBookingsFetchRef.current = lastUserBookingsFetch;

  // Get user context and error handler
  const userContext = useUser();
  const { handleError: originalHandleError } = useErrorHandler();
  
  // Extract values safely
  const address = userContext?.address || null;
  
  // Memoize handleError to prevent unnecessary re-renders
  const handleError = useMemoizedValue(() => 
    originalHandleError || ((error) => devLog.error('BookingContext error:', error)),
    [originalHandleError]
  );

  // Longer debounce for bookings to reduce RPC calls
  const debouncedAddress = useDebounced(address, 1500); // 1.5 seconds debounce

  // Enhanced loading states
  const [bookingsStatus] = useState({
    isLoading: false,
    hasError: false,
    lastFetch: null,
    isUsingCache: false,
    fetchAttempts: 0,
    nextRetryAt: null
  });

  // Cache keys
  const CACHE_KEYS = useMemoizedValue(() => ({
    USER_BOOKINGS: `user_bookings_v4_${debouncedAddress || 'anonymous'}`,
    LAB_BOOKINGS: (labId) => `lab_bookings_v4_${labId}`,
  }), [debouncedAddress]);

  const fetchUserBookings = useCallback(async (force = false) => {
    if (!debouncedAddress) {
      devLog.log('BookingContext: No address provided for fetchUserBookings');
      setUserBookings([]);
      return [];
    }

    const now = Date.now();
    const minInterval = 30000; // 30 seconds minimum interval
    
    if (!force && now - lastUserBookingsFetch < minInterval) {
      devLog.log(`BookingContext: User bookings fetch debounced (${minInterval/1000}s interval)`);
      return userBookings;
    }

    try {
      setUserBookingsLoading(true);
      setLastUserBookingsFetch(now);

      // Try cache first unless forced
      if (!force) {
        const cached = cacheManager.get(CACHE_KEYS.USER_BOOKINGS);
        if (cached && Array.isArray(cached)) {
          devLog.log(`🔄 BookingContext: fetchUserBookings - Using CACHE (no API call) (${cached.length} bookings)`);
          setUserBookings(cached);
          return cached;
        }
      }

      devLog.warn('🚨 BookingContext: fetchUserBookings - Making API CALL to /api/contract/reservation/getUserBookings');
      
      const response = await deduplicatedFetch('/api/contract/reservation/getUserBookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userAddress: debouncedAddress,
          clearCache: force 
        }),
        signal: AbortSignal.timeout(90000)
      }, force ? 0 : 600000);

      if (!response.ok) {
        throw createBlockchainError(`HTTP ${response.status}: ${response.statusText}`, {
          status: response.status,
          context: 'fetchUserBookings'
        });
      }

      const userBookingsData = await response.json();
      
      if (!Array.isArray(userBookingsData)) {
        devLog.warn('BookingContext: Invalid API response for user bookings', userBookingsData);
        return [];
      }

      // Cache and update state
      cacheManager.set(CACHE_KEYS.USER_BOOKINGS, userBookingsData, CACHE_TTL.BOOKINGS);
      setUserBookings(userBookingsData);
      
      devLog.log(`BookingContext: Fetched ${userBookingsData.length} user bookings`);
      return userBookingsData;

    } catch (error) {
      devLog.error('BookingContext: Error fetching user bookings:', error);
      handleError(error, {
        context: 'fetchUserBookings',
        address: debouncedAddress,
        severity: ErrorSeverity.MEDIUM,
        category: ErrorCategory.BLOCKCHAIN
      });
      return [];
    } finally {
      setUserBookingsLoading(false);
    }
  }, [debouncedAddress, handleError, CACHE_KEYS.USER_BOOKINGS]);

  // Manual refresh with rate limiting bypass
  const refreshBookings = useCallback(async () => {
    devLog.log('BookingContext: Manual refresh requested');
    return await fetchUserBookings(true);
  }, [fetchUserBookings]);

  // Fetch bookings for a specific lab
  const fetchLabBookings = useCallback(async (labId, force = false) => {
    if (!labId) {
      devLog.warn('BookingContext: No labId provided for fetchLabBookings');
      return [];
    }

    const cacheKey = CACHE_KEYS.LAB_BOOKINGS(labId);
    
    try {
      // Try cache first unless forced
      if (!force) {
        const cached = cacheManager.get(cacheKey);
        if (cached && Array.isArray(cached)) {
          devLog.log(`🔄 BookingContext: fetchLabBookings(${labId}) - Using CACHE (no API call)`, `${cached.length} bookings`);
          
          // Update state
          setLabBookings(prev => new Map(prev).set(labId.toString(), cached));
          return cached;
        }
      }

      devLog.warn(`🚨 BookingContext: fetchLabBookings(${labId}) - Making API CALL to /api/contract/reservation/getLabBookings`);

      const response = await deduplicatedFetch('/api/contract/reservation/getLabBookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          labId: labId,
          clearCache: force 
        }),
        signal: AbortSignal.timeout(90000)
      }, force ? 0 : 300000); // 5 minutes cache unless forced

      if (!response.ok) {
        throw createBlockchainError(`HTTP ${response.status}: ${response.statusText}`, {
          status: response.status,
          context: 'fetchLabBookings'
        });
      }

      const labBookingsData = await response.json();
      
      if (!Array.isArray(labBookingsData)) {
        devLog.warn(`BookingContext: Invalid API response for lab ${labId}`, labBookingsData);
        return [];
      }

      // Cache and update state
      cacheManager.set(cacheKey, labBookingsData, CACHE_TTL.BOOKINGS);
      setLabBookings(prev => new Map(prev).set(labId.toString(), labBookingsData));
      
      devLog.log(`BookingContext: Fetched ${labBookingsData.length} bookings for lab ${labId}`);
      return labBookingsData;

    } catch (error) {
      devLog.error(`BookingContext: Error fetching lab ${labId} bookings:`, error);
      handleError(error, {
        context: 'fetchLabBookings',
        labId,
        severity: ErrorSeverity.MEDIUM,
        category: ErrorCategory.BLOCKCHAIN
      });
      return [];
    }
  }, [handleError, CACHE_KEYS]); // Added CACHE_KEYS dependency

  // Initialize user bookings when address changes
  useEffect(() => {
    devLog.warn('🔥 BookingContext: User bookings useEffect TRIGGERED - This could cause API calls');
    if (!debouncedAddress) {
      devLog.log('BookingContext: No address, clearing user bookings');
      setUserBookings([]);
      return;
    }

    let mounted = true;

    const initializeUserBookings = async () => {
      try {
        // Skip if already loading to prevent redundant calls
        if (userBookingsLoadingRef.current) {
          devLog.log('BookingContext: Already loading user bookings, skipping initialization');
          return;
        }

        // Try cache first for instant load
        const cachedUser = cacheManager.get(CACHE_KEYS.USER_BOOKINGS);

        if (cachedUser && Array.isArray(cachedUser)) {
          devLog.log(`BookingContext: Instant load from cache (${cachedUser.length} user bookings)`);
          setUserBookings(cachedUser);
        }

        // Only fetch fresh data if we don't have recent data and component is still mounted
        const hasRecentData = lastUserBookingsFetchRef.current && (Date.now() - lastUserBookingsFetchRef.current < 30000); // 30 seconds
        if (mounted && !hasRecentData && !userBookingsLoadingRef.current) {
          devLog.log('BookingContext: Fetching fresh user bookings in background');
          await fetchUserBookings(false);
        } else if (hasRecentData) {
          devLog.log('BookingContext: Using recent user bookings data, skipping fresh fetch');
        }
      } catch (error) {
        devLog.error('BookingContext: Initialize user bookings error:', error);
      }
    };

    initializeUserBookings();

    return () => {
      mounted = false;
    };
  }, [debouncedAddress, CACHE_KEYS.USER_BOOKINGS]);

  // Booking state mutations
  const updateBookingStatus = useCallback((reservationKey, newStatus) => {
    // Update user bookings
    setUserBookings(prev => prev.map(booking => 
      booking.reservationKey === reservationKey 
        ? { ...booking, status: newStatus }
        : booking
    ));
    
    // Update lab bookings
    setLabBookings(prev => {
      const newMap = new Map(prev);
      newMap.forEach((bookings, labId) => {
        const updatedBookings = bookings.map(booking =>
          booking.reservationKey === reservationKey 
            ? { ...booking, status: newStatus }
            : booking
        );
        newMap.set(labId, updatedBookings);
        // Update cache for this lab
        cacheManager.set(CACHE_KEYS.LAB_BOOKINGS(labId), updatedBookings, CACHE_TTL.BOOKINGS);
      });
      return newMap;
    });

    // Update user bookings cache
    const updatedUserBookings = userBookings.map(booking => 
      booking.reservationKey === reservationKey 
        ? { ...booking, status: newStatus }
        : booking
    );
    cacheManager.set(CACHE_KEYS.USER_BOOKINGS, updatedUserBookings, CACHE_TTL.BOOKINGS);
  }, [userBookings, CACHE_KEYS]);

  // Update optimistic booking status and add reservationKey
  const updateOptimisticBookingStatus = useCallback((labId, start, end, newStatus, reservationKey) => {
    const labIdStr = labId?.toString();
    
    // Update user bookings - find optimistic booking by labId, start, end
    setUserBookings(prev => prev.map(booking => {
      if (booking.isOptimistic && 
          booking.labId?.toString() === labIdStr && 
          booking.start === start && 
          booking.end === end) {
        return { 
          ...booking, 
          status: newStatus, 
          reservationKey: reservationKey,
          isOptimistic: false // No longer optimistic, now confirmed
        };
      }
      return booking;
    }));
    
    // Update lab bookings - find optimistic booking by labId, start, end
    setLabBookings(prev => {
      const newMap = new Map(prev);
      if (newMap.has(labIdStr)) {
        const updatedBookings = newMap.get(labIdStr).map(booking => {
          if (booking.isOptimistic && 
              booking.labId?.toString() === labIdStr && 
              booking.start === start && 
              booking.end === end) {
            return { 
              ...booking, 
              status: newStatus, 
              reservationKey: reservationKey,
              isOptimistic: false // No longer optimistic, now confirmed
            };
          }
          return booking;
        });
        newMap.set(labIdStr, updatedBookings);
        // Update cache for this lab
        cacheManager.set(CACHE_KEYS.LAB_BOOKINGS(labIdStr), updatedBookings, CACHE_TTL.BOOKINGS);
      }
      return newMap;
    });

    // Update user bookings cache
    const updatedUserBookings = userBookings.map(booking => {
      if (booking.isOptimistic && 
          booking.labId?.toString() === labIdStr && 
          booking.start === start && 
          booking.end === end) {
        return { 
          ...booking, 
          status: newStatus, 
          reservationKey: reservationKey,
          isOptimistic: false
        };
      }
      return booking;
    });
    cacheManager.set(CACHE_KEYS.USER_BOOKINGS, updatedUserBookings, CACHE_TTL.BOOKINGS);
    
    devLog.log('✅ Updated optimistic booking to confirmed:', { 
      labId: labIdStr, start, end, newStatus, reservationKey 
    });
  }, [userBookings, CACHE_KEYS]);

  // Update specific optimistic booking to confirmed status using blockchain event data
  const confirmOptimisticBookingByEventData = useCallback((labId, start, end, reservationKey, newStatus = "1") => {
    const labIdStr = labId?.toString();
    const startNum = typeof start === 'string' ? parseInt(start) : start;
    const endNum = typeof end === 'string' ? parseInt(end) : end;
    
    devLog.log('🎯 Attempting to confirm specific optimistic booking:', { 
      labId: labIdStr, start: startNum, end: endNum, reservationKey, newStatus 
    });
    
    let bookingFound = false;
    
    // Update user bookings - find specific optimistic booking by labId, start, end
    setUserBookings(prev => prev.map(booking => {
      if (booking.isOptimistic && 
          booking.labId?.toString() === labIdStr && 
          booking.start === startNum && 
          booking.end === endNum) {
        bookingFound = true;
        devLog.log('✅ Found and updating optimistic user booking:', booking);
        return { 
          ...booking, 
          status: newStatus,
          isOptimistic: false,
          reservationKey: reservationKey
        };
      }
      return booking;
    }));
    
    // Update lab bookings - find specific optimistic booking by labId, start, end
    setLabBookings(prev => {
      const newMap = new Map(prev);
      if (newMap.has(labIdStr)) {
        const updatedBookings = newMap.get(labIdStr).map(booking => {
          if (booking.isOptimistic && 
              booking.labId?.toString() === labIdStr && 
              booking.start === startNum && 
              booking.end === endNum) {
            devLog.log('✅ Found and updating optimistic lab booking:', booking);
            return { 
              ...booking, 
              status: newStatus,
              isOptimistic: false,
              reservationKey: reservationKey
            };
          }
          return booking;
        });
        newMap.set(labIdStr, updatedBookings);
        // Update cache for this lab
        cacheManager.set(CACHE_KEYS.LAB_BOOKINGS(labIdStr), updatedBookings, CACHE_TTL.BOOKINGS);
      }
      return newMap;
    });

    // Update user bookings cache
    const updatedUserBookings = userBookings.map(booking => {
      if (booking.isOptimistic && 
          booking.labId?.toString() === labIdStr && 
          booking.start === startNum && 
          booking.end === endNum) {
        return { 
          ...booking, 
          status: newStatus,
          isOptimistic: false,
          reservationKey: reservationKey
        };
      }
      return booking;
    });
    cacheManager.set(CACHE_KEYS.USER_BOOKINGS, updatedUserBookings, CACHE_TTL.BOOKINGS);
    
    if (bookingFound) {
      devLog.log('✅ Successfully confirmed specific optimistic booking:', { 
        labId: labIdStr, start: startNum, end: endNum, reservationKey 
      });
    } else {
      devLog.warn('⚠️ No optimistic booking found for event data:', { 
        labId: labIdStr, start: startNum, end: endNum, reservationKey 
      });
    }
    
    return bookingFound;
  }, [userBookings, CACHE_KEYS]);

  const removeBooking = useCallback((reservationKey) => {
    // Remove from user bookings
    setUserBookings(prev => {
      const updated = prev.filter(booking => booking.reservationKey !== reservationKey);
      // Update cache
      cacheManager.set(CACHE_KEYS.USER_BOOKINGS, updated, CACHE_TTL.BOOKINGS);
      return updated;
    });
    
    // Remove from lab bookings
    setLabBookings(prev => {
      const newMap = new Map(prev);
      newMap.forEach((bookings, labId) => {
        const updatedBookings = bookings.filter(booking => booking.reservationKey !== reservationKey);
        newMap.set(labId, updatedBookings);
        // Update cache for this lab
        cacheManager.set(CACHE_KEYS.LAB_BOOKINGS(labId), updatedBookings, CACHE_TTL.BOOKINGS);
      });
      return newMap;
    });
  }, [CACHE_KEYS]);

  // Get bookings for a specific lab (from lab-specific cache only)
  const getLabBookings = useCallback((labId) => {
    const labSpecificBookings = labBookings.get(labId?.toString());
    if (labSpecificBookings) {
      return labSpecificBookings;
    }
    
    // Return empty array if not found
    return [];
  }, [labBookings]);

  // Get user bookings for a specific lab
  const getUserLabBookings = useCallback((labId) => {
    return userBookings.filter(booking => booking.labId === labId);
  }, [userBookings]);

  // Get cached lab bookings without fetching
  const getCachedLabBookings = useCallback((labId) => {
    return labBookings.get(labId?.toString()) || [];
  }, [labBookings]);

  // Check if lab bookings are loaded
  const isLabBookingsLoaded = useCallback((labId) => {
    return labBookings.has(labId?.toString());
  }, [labBookings]);

  // Add booking to lab cache (optimistic update)
  const addBookingToLabCache = useCallback((labId, newBooking) => {
    const normalizedLabId = labId?.toString();
    if (!normalizedLabId || !newBooking) {
      devLog.warn('BookingContext: addBookingToLabCache - missing labId or booking');
      return;
    }

    devLog.log(`✨ BookingContext: Adding booking to cache for lab ${normalizedLabId}:`, newBooking);
    
    setLabBookings(prev => {
      const newMap = new Map(prev);
      const existingBookings = newMap.get(normalizedLabId) || [];
      
      // Check if booking already exists (avoid duplicates)
      const bookingExists = existingBookings.some(booking => 
        booking.reservationKey === newBooking.reservationKey ||
        (booking.start === newBooking.start && booking.end === newBooking.end && booking.renter === newBooking.renter)
      );
      
      if (!bookingExists) {
        const updatedBookings = [...existingBookings, newBooking];
        newMap.set(normalizedLabId, updatedBookings);
        
        // Update cache
        cacheManager.set(CACHE_KEYS.LAB_BOOKINGS(normalizedLabId), updatedBookings, CACHE_TTL.BOOKINGS);
        
        devLog.log(`✅ BookingContext: Added booking to lab ${normalizedLabId} cache. Total bookings: ${updatedBookings.length}`);
      } else {
        devLog.log(`⚠️ BookingContext: Booking already exists in lab ${normalizedLabId} cache, skipping`);
      }
      
      return newMap;
    });
  }, [CACHE_KEYS]);

  // Add booking to user cache (optimistic update)
  const addBookingToCache = useCallback((newBooking) => {
    if (!newBooking) {
      devLog.warn('BookingContext: addBookingToCache - missing booking');
      return;
    }

    devLog.log(`✨ BookingContext: Adding booking to user cache:`, newBooking);
    
    setUserBookings(prev => {
      // Check if booking already exists (avoid duplicates)
      const bookingExists = prev.some(booking => 
        booking.reservationKey === newBooking.reservationKey ||
        (booking.start === newBooking.start && booking.end === newBooking.end && booking.renter === newBooking.renter)
      );
      
      if (!bookingExists) {
        const updatedBookings = [...prev, newBooking];
        
        // Update cache
        cacheManager.set(CACHE_KEYS.USER_BOOKINGS, updatedBookings, CACHE_TTL.BOOKINGS);
        
        devLog.log(`✅ BookingContext: Added booking to user cache. Total bookings: ${updatedBookings.length}`);
        return updatedBookings;
      } else {
        devLog.log(`⚠️ BookingContext: Booking already exists in user cache, skipping`);
        return prev;
      }
    });
  }, [CACHE_KEYS.USER_BOOKINGS]);

  // Clear cache utility
  const clearBookingsCache = useCallback(() => {
    cacheManager.delete(CACHE_KEYS.USER_BOOKINGS);
    
    // Clear lab bookings cache
    setLabBookings(prev => {
      prev.forEach((_, labId) => {
        cacheManager.delete(CACHE_KEYS.LAB_BOOKINGS(labId));
      });
      return new Map();
    });
    
    setUserBookings([]);
  }, [CACHE_KEYS]);

  // Clear specific lab cache utility
  const clearLabBookingsCache = useCallback((labId) => {
    if (!labId) return;
    
    const normalizedLabId = labId.toString();
    cacheManager.delete(CACHE_KEYS.LAB_BOOKINGS(normalizedLabId));
    
    // Remove from state
    setLabBookings(prev => {
      const newMap = new Map(prev);
      newMap.delete(normalizedLabId);
      return newMap;
    });
    
    devLog.log(`🗑️ Cleared cache for lab ${normalizedLabId}`);
  }, [CACHE_KEYS]);

  // Context value
  const contextValue = useMemoizedValue(() => ({
    // Data
    userBookings,
    labBookings,
    
    // Loading states
    bookingsLoading: userBookingsLoading, // Main loading state refers to user bookings
    bookingsStatus,
    userBookingsLoading,
    
    // Actions
    fetchUserBookings,
    fetchLabBookings,
    refreshBookings,
    updateBookingStatus,
    updateOptimisticBookingStatus,
    confirmOptimisticBookingByEventData,
    removeBooking,
    clearBookingsCache,
    clearLabBookingsCache,
    addBookingToLabCache,
    addBookingToCache,
    
    // Getters
    getLabBookings,
    getUserLabBookings,
    getCachedLabBookings,
    isLabBookingsLoaded,
    
    // Utils
    isLoading: userBookingsLoading || bookingsStatus.isLoading,
    hasError: bookingsStatus.hasError,
    isUsingCache: bookingsStatus.isUsingCache,
    nextRetryAt: bookingsStatus.nextRetryAt,
  }), [
    userBookings,
    labBookings,
    userBookingsLoading,
    bookingsStatus,
    fetchUserBookings,
    fetchLabBookings,
    refreshBookings,
    updateBookingStatus,
    updateOptimisticBookingStatus,
    confirmOptimisticBookingByEventData,
    removeBooking,
    clearBookingsCache,
    clearLabBookingsCache,
    addBookingToLabCache,
    addBookingToCache,
    getLabBookings,
    getUserLabBookings,
    getCachedLabBookings,
    isLabBookingsLoaded,
  ]);

  return (
    <OptimizedBookingProvider value={contextValue}>
      {children}
    </OptimizedBookingProvider>
  );
}

export function BookingData({ children }) {
  return <BookingDataCore>{children}</BookingDataCore>;
}

export function useBookings() {
  const context = useBookingContext();
  if (!context) {
    throw new Error('useBookings must be used within a BookingData');
  }
  return context;
}

// ===========================
// ADVANCED BOOKING HOOKS
// ===========================

// Configuration constants
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
  cacheTTL: 30000,              // 30 seconds cache validity
  enableDebugLogs: false        // Debug logging
};

/**
 * Advanced hook for user bookings with parametrized update strategy
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
export function useAdvancedUserBookings(options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  const { address, isLoggedIn } = useUser();
  const { processingBookings } = useBookingEvents();
  const context = useBookingContext();
  const { 
    userBookings, 
    refreshBookings, 
    userBookingsLoading 
  } = context;
  
  const [forceUpdateTrigger, setForceUpdateTrigger] = useState(0);
  const [lastUpdateTime] = useState(Date.now()); // Static timestamp for initial load
  const intervalRef = useRef(null);
  const timeoutRef = useRef(null);
  
  const log = useCallback((message, data = {}) => {
    if (config.enableDebugLogs) {
      devLog.log(`[useAdvancedUserBookings:${config.strategy}] ${message}`, data);
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
      
      if (config.enableDebugLogs) {
        devLog.log(`[useAdvancedUserBookings:${config.strategy}] Scheduling real-time update`, {
          nextUpdateTime: nextUpdateTime.toISOString(),
          timeUntilUpdate,
          needsContractSync
        });
      }

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        if (config.enableDebugLogs) {
          devLog.log(`[useAdvancedUserBookings:${config.strategy}] Real-time update triggered`);
        }
        if (needsContractSync && refreshBookings) {
          refreshBookings();
        } else {
          setForceUpdateTrigger(prev => prev + 1);
        }
        // Note: Removed recursive call to prevent infinite loops
      }, timeUntilUpdate);
    }
  }, [config.enableRealTimeUpdates, config.enableDebugLogs, config.strategy, isLoggedIn, userBookings, refreshBookings]);

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
        // Periodic logic is handled in the interval section above
        break;
        
      case UPDATE_STRATEGIES.HYBRID:
        scheduleNextRealTimeUpdate();
        // Periodic logic is handled in the interval section above
        break;
        
      case UPDATE_STRATEGIES.ON_DEMAND:
        // No automatic updates
        break;
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [config.strategy, options.enabled]); // Removed problematic functions from dependencies

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
    if (!config.enableContractEvents || !processingBookings) return;
    
    // Handle both Set and Array types for processingBookings
    const reservationsCount = Array.isArray(processingBookings) 
      ? processingBookings.length 
      : processingBookings.size || 0;
    
    log('Contract events monitoring enabled', { 
      processingCount: reservationsCount 
    });
    
    // Force update when processing reservations change
    setForceUpdateTrigger(prev => prev + 1);
  }, [config.enableContractEvents, processingBookings, log]);

  // ===========================
  // RETURN API
  // ===========================
  
  return {
    // Data
    userBookings,
    loading: userBookingsLoading,
    
    // Actions
    refreshBookings,
    forceUpdate: () => setForceUpdateTrigger(prev => prev + 1),
    
    // Status
    lastUpdateTime,
    forceUpdateTrigger,
    strategy: config.strategy,
    isEnabled: options.enabled !== false,
    
    // Debug
    config: config.enableDebugLogs ? config : undefined
  };
}

/**
 * Advanced hook for lab-specific bookings with parametrized update strategy
 * 
 * @param {string|number} labId - The ID of the lab
 * @param {Object} options - Configuration options
 * @returns {Object} Lab bookings state and actions
 */
export function useAdvancedLabBookings(labId, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  const normalizedLabId = labId?.toString();
  const { processingBookings } = useBookingEvents();
  
  const context = useBookingContext();
  const { 
    fetchLabBookings, 
    getLabBookings, 
    isLabBookingsLoaded 
  } = context;
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetchTime, setLastFetchTime] = useState(0);
  const [forceUpdateTrigger, setForceUpdateTrigger] = useState(0);
  const intervalRef = useRef(null);
  
  const log = useCallback((message, data = {}) => {
    if (config.enableDebugLogs) {
      devLog.log(`[useAdvancedLabBookings:${config.strategy}:${normalizedLabId}] ${message}`, data);
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
      if (config.enableDebugLogs) {
        devLog.log(`[useAdvancedLabBookings:${config.strategy}:${normalizedLabId}] No labId provided`);
      }
      return [];
    }

    if (loading && !force) {
      if (config.enableDebugLogs) {
        devLog.log(`[useAdvancedLabBookings:${config.strategy}:${normalizedLabId}] Already loading, skipping`);
      }
      return getLabBookings(normalizedLabId);
    }

    const currentBookings = getLabBookings(normalizedLabId);
    if (!force && isLoaded && Array.isArray(currentBookings)) {
      if (config.enableDebugLogs) {
        devLog.log(`[useAdvancedLabBookings:${config.strategy}:${normalizedLabId}] Using cached data`);
      }
      return currentBookings;
    }

    try {
      setLoading(true);
      setError(null);
      
      if (config.enableDebugLogs) {
        devLog.log(`[useAdvancedLabBookings:${config.strategy}:${normalizedLabId}] Fetching lab bookings`, { force });
      }
      
      const bookings = await fetchLabBookings(normalizedLabId);
      setLastFetchTime(Date.now());
      
      if (config.enableDebugLogs) {
        devLog.log(`[useAdvancedLabBookings:${config.strategy}:${normalizedLabId}] Successfully fetched lab bookings`, { count: bookings?.length });
      }
      
      return bookings;
    } catch (err) {
      const errorMessage = err.message || 'Failed to fetch lab bookings';
      setError(errorMessage);
      if (config.enableDebugLogs) {
        devLog.log(`[useAdvancedLabBookings:${config.strategy}:${normalizedLabId}] Error fetching lab bookings`, { error: errorMessage });
      }
      throw err;
    } finally {
      setLoading(false);
    }
  }, [normalizedLabId, loading, getLabBookings, isLoaded, fetchLabBookings, config.enableDebugLogs, config.strategy]);

  // ===========================
  // AUTO-FETCH ON MOUNT
  // ===========================
  
  useEffect(() => {
    if (config.autoFetch && normalizedLabId && !isLoaded) {
      if (config.enableDebugLogs) {
        devLog.log(`[useAdvancedLabBookings:${config.strategy}:${normalizedLabId}] Auto-fetching lab bookings on mount`);
      }
      fetchBookings(false);
    }
  }, [config.autoFetch, config.enableDebugLogs, config.strategy, normalizedLabId, isLoaded, fetchBookings]);

  // ===========================
  // STRATEGY MANAGEMENT (PERIODIC UPDATES)
  // ===========================
  
  useEffect(() => {
    if (!options.enabled && options.enabled !== undefined) {
      return;
    }

    // Only start periodic updates for PERIODIC and HYBRID strategies
    if ((config.strategy === UPDATE_STRATEGIES.PERIODIC || config.strategy === UPDATE_STRATEGIES.HYBRID) && normalizedLabId) {
      if (intervalRef.current === null) {
        intervalRef.current = setInterval(() => {
          if (config.enableDebugLogs) {
            devLog.log(`[useAdvancedLabBookings:${config.strategy}:${normalizedLabId}] Periodic update triggered`);
          }
          fetchBookings(false);
        }, config.interval);
        
        if (config.enableDebugLogs) {
          devLog.log(`[useAdvancedLabBookings:${config.strategy}:${normalizedLabId}] Starting periodic updates`, { interval: config.interval });
        }
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        if (config.enableDebugLogs) {
          devLog.log(`[useAdvancedLabBookings:${config.strategy}:${normalizedLabId}] Stopped periodic updates`);
        }
      }
    };
  }, [config.strategy, config.interval, config.enableDebugLogs, normalizedLabId, options.enabled, fetchBookings]);

  // ===========================
  // CONTRACT EVENTS
  // ===========================
  
  useEffect(() => {
    if (!config.enableContractEvents || !processingBookings) return;
    
    // Handle both Set and Array types for processingBookings
    const reservationsArray = Array.isArray(processingBookings) 
      ? processingBookings 
      : Array.from(processingBookings);
    
    // Check if any processing reservation is for this lab
    const labProcessingBookings = reservationsArray.filter(
      reservation => {
        // Handle both string reservationKeys and reservation objects
        if (typeof reservation === 'string') {
          // If it's just a reservation key, we can't filter by labId
          return true; // Trigger update for any processing reservation
        }
        return reservation.labId === normalizedLabId;
      }
    );
    
    if (labProcessingBookings.length > 0) {
      if (config.enableDebugLogs) {
        devLog.log(`[useAdvancedLabBookings:${config.strategy}:${normalizedLabId}] Contract events for this lab detected`, { 
          count: labProcessingBookings.length 
        });
      }
      setForceUpdateTrigger(prev => prev + 1);
    }
  }, [config.enableContractEvents, config.enableDebugLogs, config.strategy, processingBookings, normalizedLabId]);

  // ===========================
  // RETURN API
  // ===========================
  
  return {
    // Data
    labBookings,
    bookings: labBookings,
    bookingsCount: labBookings?.length || 0,
    
    // Status
    loading,
    isLoading: loading,
    error,
    isLoaded,
    isFresh: () => {
      if (!lastFetchTime) return false;
      const FRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes
      return (Date.now() - lastFetchTime) < FRESH_THRESHOLD;
    },
    lastFetchTime,
    
    // Actions
    fetchBookings,
    refreshBookings: () => fetchBookings(true),
    refetch: () => fetchBookings(true),
    forceUpdate: () => setForceUpdateTrigger(prev => prev + 1),
    
    // Utilities
    getBookingsByStatus: (status) => labBookings.filter(booking => booking.status === status.toString()),
    getActiveBookings: () => labBookings.filter(booking => booking.status === "1"),
    getPendingBookings: () => labBookings.filter(booking => booking.status === "0"),
    getCachedBookings: () => getLabBookings(normalizedLabId),
    
    // Status
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

// Preset configurations for common use cases
export const BOOKING_CONFIGS = {
  // High-frequency updates for active dashboards
  DASHBOARD: {
    ...DEFAULT_CONFIG,
    strategy: UPDATE_STRATEGIES.HYBRID,
    interval: 30000,
    enableRealTimeUpdates: true,
    enableContractEvents: true,
    enableDebugLogs: false
  }
};

export { UPDATE_STRATEGIES };

// ===========================
// SPECIALIZED HOOKS
// ===========================

/**
 * Hook for user dashboard - optimized for frequent updates
 */
export function useUserDashboardBookings() {
  return useAdvancedUserBookings(BOOKING_CONFIGS.DASHBOARD);
}

/**
 * Hook for provider dashboard - optimized for lab management
 */
export function useProviderDashboardBookings(labId) {
  return useAdvancedLabBookings(labId, BOOKING_CONFIGS.DASHBOARD);
}

/**
 * Hook for market component - balanced updates
 */
export function useMarketBookings() {
  return useAdvancedUserBookings({
    strategy: UPDATE_STRATEGIES.HYBRID,
    interval: 60000,
    enableRealTimeUpdates: true,
    enableContractEvents: true,
    enableDebugLogs: false
  });
}

/**
 * Hook for lab reservation component - real-time updates
 */
export function useLabReservationBookings(labId) {
  return useAdvancedLabBookings(labId, {
    strategy: UPDATE_STRATEGIES.REAL_TIME,
    enableRealTimeUpdates: true,
    enableContractEvents: true,
    autoFetch: true,
    enableDebugLogs: false
  });
}

export const BookingProvider = BookingData;