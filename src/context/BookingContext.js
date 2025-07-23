"use client";
import { useState, useEffect, useCallback } from 'react';
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
  // Enhanced state management
  const [allBookings, setAllBookings] = useState([]);
  const [userBookings, setUserBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [lastBookingsFetch, setLastBookingsFetch] = useState(0);
  const [fetchAttempts, setFetchAttempts] = useState(0);

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
  
  devLog.log('BookingContext: User address from context:', address);

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
    ALL_BOOKINGS: 'all_bookings_v3',
    USER_BOOKINGS: `user_bookings_v3_${debouncedAddress || 'anonymous'}`,
  }), [debouncedAddress]);

  // Smart rate limiting - progressive backoff
  const getRetryDelay = useCallback((attempts) => {
    // Progressive backoff: 5s, 15s, 30s, 60s, 120s
    const delays = [5000, 15000, 30000, 60000, 120000];
    return delays[Math.min(attempts, delays.length - 1)];
  }, []);

  // Enhanced fetchBookings with intelligent rate limiting
  const fetchBookings = useCallback(async (force = false) => {
    const now = Date.now();
    
    // Smart debouncing - reduced for initial loads, more aggressive after real failures
    const hasSuccessfulFetch = allBookings.length > 0; // Have we ever gotten data?
    let minInterval;
    
    if (!hasSuccessfulFetch) {
      // If we've never gotten data successfully, be more permissive
      minInterval = fetchAttempts > 3 ? 30000 : 10000; // 30s after 3 failures, 10s normally
    } else {
      // If we have data, use longer intervals to avoid spam
      minInterval = fetchAttempts > 2 ? 120000 : 60000; // 2 minutes after failures, 1 minute normally
    }
    
    if (!force && now - lastBookingsFetch < minInterval) {
      devLog.log(`BookingContext: Fetch debounced (${minInterval/1000}s interval, ${Math.round((minInterval - (now - lastBookingsFetch))/1000)}s remaining)`);
      return;
    }

    // Rate limiting after consecutive failures - but less strict for first loads
    const maxAttempts = hasSuccessfulFetch ? 3 : 5; // Allow more attempts if we've never gotten data
    if (fetchAttempts >= maxAttempts && !force) {
      const retryDelay = getRetryDelay(fetchAttempts - maxAttempts);
      const nextRetryTime = lastBookingsFetch + retryDelay;
      if (now < nextRetryTime) {
        const waitTime = Math.round((nextRetryTime - now) / 1000);
        devLog.log(`BookingContext: Rate limited, next retry in ${waitTime}s`);
        setBookingsStatus(prev => ({
          ...prev,
          nextRetryAt: new Date(nextRetryTime)
        }));
        return;
      }
    }

    devLog.log('BookingContext: Starting bookings fetch', { 
      force, 
      attempts: fetchAttempts,
      debouncedAddress 
    });

    setBookingsStatus(prev => ({
      ...prev,
      isLoading: true,
      hasError: false,
      nextRetryAt: null
    }));

    try {
      setBookingsLoading(true);
      setLastBookingsFetch(now);

      // Try cache first unless forced
      let allBookingsData;
      if (!force) {
        const cached = cacheManager.get(CACHE_KEYS.ALL_BOOKINGS);
        if (cached && Array.isArray(cached)) {
          devLog.log('BookingContext: Cache hit', `${cached.length} bookings`);
          allBookingsData = cached;
        }
      }

      // Fetch if not in cache or forced
      if (!allBookingsData) {
        devLog.log('BookingContext: Fetching from API...');
        
        // Extended timeout for stability
        const response = await deduplicatedFetch('/api/contract/reservation/getBookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            wallet: null,
            clearCache: force 
          }),
          signal: AbortSignal.timeout(90000) // 90 seconds
        }, force ? 0 : 600000); // 10 minutes cache unless forced

        if (!response.ok) {
          throw createBlockchainError(`HTTP ${response.status}: ${response.statusText}`, {
            status: response.status,
            context: 'fetchBookings'
          });
        }

        allBookingsData = await response.json();
        
        if (!Array.isArray(allBookingsData)) {
          devLog.warn('BookingContext: Invalid API response', allBookingsData);
          allBookingsData = [];
        }

        // Cache for longer period
        cacheManager.set(CACHE_KEYS.ALL_BOOKINGS, allBookingsData, CACHE_TTL.BOOKINGS * 2); // Double the cache time
        devLog.log(`BookingContext: Cached ${allBookingsData.length} bookings`);
      }

      // Process bookings
      setAllBookings(allBookingsData);

      // Filter user bookings
      const filteredUserBookings = debouncedAddress 
        ? allBookingsData.filter(booking => {
            const isUserBooking = booking.renter && booking.renter.toLowerCase() === debouncedAddress.toLowerCase();
            if (isUserBooking) {
              devLog.log('Found user booking:', {
                reservationKey: booking.reservationKey,
                labId: booking.labId,
                status: booking.status
              });
            }
            return isUserBooking;
          })
        : [];

      setUserBookings(filteredUserBookings);
      
      // Cache user bookings separately
      if (debouncedAddress) {
        cacheManager.set(CACHE_KEYS.USER_BOOKINGS, filteredUserBookings, CACHE_TTL.BOOKINGS);
      }

      devLog.log(`BookingContext: Processed ${filteredUserBookings.length} user bookings from ${allBookingsData.length} total`);

      // Reset failure count on success
      setFetchAttempts(0);
      
      setBookingsStatus(prev => ({
        ...prev,
        isLoading: false,
        isUsingCache: !!allBookingsData && !force,
        lastFetch: new Date(),
        fetchAttempts: 0,
        hasError: false
      }));

    } catch (err) {
      devLog.error('BookingContext: Fetch error:', err);
      
      // Check if this is a rate limiting error (don't penalize as heavily)
      const isRateLimitError = err.message?.includes('429') || 
                              err.message?.includes('rate limit') ||
                              err.message?.includes('Rate limited') ||
                              err.status === 429;
      
      // Only increment attempts for non-rate-limit errors, or after multiple rate limit errors
      let shouldIncrementAttempts = true;
      if (isRateLimitError && fetchAttempts < 2) {
        shouldIncrementAttempts = false; // Don't penalize first few rate limit errors
        devLog.log('BookingContext: Rate limit detected, not incrementing attempt counter');
      }
      
      const newAttempts = shouldIncrementAttempts ? fetchAttempts + 1 : fetchAttempts;
      setFetchAttempts(newAttempts);
      
      setBookingsStatus(prev => ({
        ...prev,
        isLoading: false,
        hasError: true,
        fetchAttempts: newAttempts
      }));

      handleError(err, {
        context: 'fetchBookings',
        address: debouncedAddress,
        severity: isRateLimitError ? ErrorSeverity.LOW : ErrorSeverity.MEDIUM,
        category: ErrorCategory.BLOCKCHAIN
      });

      // Try to use stale cache
      const cachedBookings = cacheManager.get(CACHE_KEYS.ALL_BOOKINGS, true); // Allow stale
      const cachedUserBookings = cacheManager.get(CACHE_KEYS.USER_BOOKINGS, true);
      
      if (cachedBookings && Array.isArray(cachedBookings)) {
        devLog.warn('BookingContext: Using stale cache due to error');
        setAllBookings(cachedBookings);
        
        if (cachedUserBookings && Array.isArray(cachedUserBookings)) {
          setUserBookings(cachedUserBookings);
        } else if (debouncedAddress) {
          // Filter from stale all bookings
          const filteredFromStale = cachedBookings.filter(booking => 
            booking.renter && booking.renter.toLowerCase() === debouncedAddress.toLowerCase()
          );
          setUserBookings(filteredFromStale);
        }

        setBookingsStatus(prev => ({
          ...prev,
          isUsingCache: true,
          lastFetch: new Date()
        }));
      }

      // Schedule retry with backoff - different strategy for rate limits
      const maxRetries = hasSuccessfulFetch ? 5 : 8; // More retries if we've never gotten data
      if (newAttempts < maxRetries) {
        let retryDelay;
        if (isRateLimitError) {
          // Shorter delays for rate limit errors
          retryDelay = Math.min(5000 + (newAttempts * 2000), 15000); // 5s, 7s, 9s, 11s, 13s, 15s max
        } else {
          // Longer delays for real errors
          retryDelay = getRetryDelay(Math.max(0, newAttempts - 1));
        }
        
        devLog.log(`BookingContext: Scheduling retry ${newAttempts} in ${retryDelay/1000}s (${isRateLimitError ? 'rate-limit' : 'error'} type)`);
        
        setTimeout(() => {
          devLog.log(`BookingContext: Auto-retry ${newAttempts} after ${isRateLimitError ? 'rate limit' : 'error'}`);
          fetchBookings(false);
        }, retryDelay);
      }

    } finally {
      setBookingsLoading(false);
    }
  }, [
    debouncedAddress, 
    CACHE_KEYS.ALL_BOOKINGS, 
    CACHE_KEYS.USER_BOOKINGS, 
    lastBookingsFetch, 
    fetchAttempts,
    getRetryDelay,
    handleError
  ]);

  // Manual refresh with rate limiting bypass
  const refreshBookings = useCallback(async () => {
    devLog.log('BookingContext: Manual refresh requested');
    setFetchAttempts(0); // Reset attempts for manual refresh
    await fetchBookings(true);
  }, [fetchBookings]);

  // Initialize bookings with cache-first approach - optimized
  useEffect(() => {
    if (!debouncedAddress) {
      devLog.log('BookingContext: No address, clearing user bookings');
      setUserBookings([]);
      return;
    }

    let mounted = true;

    const initializeBookings = async () => {
      try {
        // Skip if already loading to prevent redundant calls
        if (bookingsLoading) {
          devLog.log('BookingContext: Already loading, skipping initialization');
          return;
        }

        // Try cache first for instant load
        const cachedAll = cacheManager.get(CACHE_KEYS.ALL_BOOKINGS);
        const cachedUser = cacheManager.get(CACHE_KEYS.USER_BOOKINGS);

        if (cachedAll && Array.isArray(cachedAll)) {
          devLog.log(`BookingContext: Instant load from cache (${cachedAll.length} total bookings)`);
          setAllBookings(cachedAll);

          if (cachedUser && Array.isArray(cachedUser)) {
            setUserBookings(cachedUser);
            devLog.log(`BookingContext: Loaded ${cachedUser.length} cached user bookings`);
          } else {
            // Filter from cached all bookings
            const filtered = cachedAll.filter(booking => 
              booking.renter && booking.renter.toLowerCase() === debouncedAddress.toLowerCase()
            );
            setUserBookings(filtered);
            devLog.log(`BookingContext: Filtered ${filtered.length} user bookings from cache`);
          }

          setBookingsStatus(prev => ({
            ...prev,
            isUsingCache: true,
            lastFetch: new Date()
          }));
        }

        // Only fetch fresh data if we don't have recent data and component is still mounted
        const hasRecentData = lastBookingsFetch && (Date.now() - lastBookingsFetch < 30000); // 30 seconds
        if (mounted && !hasRecentData && !bookingsLoading) {
          devLog.log('BookingContext: Fetching fresh data in background');
          await fetchBookings(false);
        } else if (hasRecentData) {
          devLog.log('BookingContext: Using recent data, skipping fresh fetch');
        }
      } catch (error) {
        devLog.error('BookingContext: Initialize error:', error);
      }
    };

    initializeBookings();

    return () => {
      mounted = false;
    };
  }, [debouncedAddress]); // Simplified dependencies to reduce re-runs

  // Booking state mutations
  const updateBookingStatus = useCallback((reservationKey, newStatus) => {
    setAllBookings(prev => prev.map(booking => 
      booking.reservationKey === reservationKey 
        ? { ...booking, status: newStatus }
        : booking
    ));
    
    setUserBookings(prev => prev.map(booking => 
      booking.reservationKey === reservationKey 
        ? { ...booking, status: newStatus }
        : booking
    ));

    // Update cache
    const updatedAll = allBookings.map(booking => 
      booking.reservationKey === reservationKey 
        ? { ...booking, status: newStatus }
        : booking
    );
    cacheManager.set(CACHE_KEYS.ALL_BOOKINGS, updatedAll, CACHE_TTL.BOOKINGS);
  }, [allBookings, CACHE_KEYS.ALL_BOOKINGS]);

  const removeBooking = useCallback((reservationKey) => {
    setAllBookings(prev => prev.filter(booking => booking.reservationKey !== reservationKey));
    setUserBookings(prev => prev.filter(booking => booking.reservationKey !== reservationKey));

    // Update cache
    const updatedAll = allBookings.filter(booking => booking.reservationKey !== reservationKey);
    cacheManager.set(CACHE_KEYS.ALL_BOOKINGS, updatedAll, CACHE_TTL.BOOKINGS);
  }, [allBookings, CACHE_KEYS.ALL_BOOKINGS]);

  // Get bookings for a specific lab
  const getLabBookings = useCallback((labId) => {
    return allBookings.filter(booking => booking.labId === labId);
  }, [allBookings]);

  // Get user bookings for a specific lab
  const getUserLabBookings = useCallback((labId) => {
    return userBookings.filter(booking => booking.labId === labId);
  }, [userBookings]);

  // Clear cache utility
  const clearBookingsCache = useCallback(() => {
    cacheManager.delete(CACHE_KEYS.ALL_BOOKINGS);
    cacheManager.delete(CACHE_KEYS.USER_BOOKINGS);
    setFetchAttempts(0);
  }, [CACHE_KEYS.ALL_BOOKINGS, CACHE_KEYS.USER_BOOKINGS]);

  // Context value
  const contextValue = useMemoizedValue(() => ({
    // Data
    allBookings,
    userBookings,
    
    // Loading states
    bookingsLoading,
    bookingsStatus,
    
    // Actions
    fetchBookings,
    refreshBookings,
    updateBookingStatus,
    removeBooking,
    clearBookingsCache,
    
    // Getters
    getLabBookings,
    getUserLabBookings,
    
    // Utils
    isLoading: bookingsLoading || bookingsStatus.isLoading,
    hasError: bookingsStatus.hasError,
    isUsingCache: bookingsStatus.isUsingCache,
    nextRetryAt: bookingsStatus.nextRetryAt,
  }), [
    allBookings,
    userBookings,
    bookingsLoading,
    bookingsStatus,
    fetchBookings,
    refreshBookings,
    updateBookingStatus,
    removeBooking,
    clearBookingsCache,
    getLabBookings,
    getUserLabBookings,
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
