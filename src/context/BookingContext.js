"use client";
import { useState, useEffect, useCallback, useRef } from 'react';
import { useUser } from '@/context/UserContext';
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
  const [bookingsStatus, setBookingsStatus] = useState({
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
  }, [debouncedAddress, handleError]);

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
  }, [handleError]); // Removed CACHE_KEYS dependency as it's memoized

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
  }, [debouncedAddress]);

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
  }, [userBookings]);

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
  }, [userBookings]);

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
  }, [userBookings]);

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
  }, []);

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
  }, []);

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
  }, []);

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
  }, []);

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
  }, []);

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

export const BookingProvider = BookingData;
