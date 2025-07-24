import { useCallback, useEffect, useState } from 'react';
import { useBookings } from '@/context/BookingContext';
import { useReservationEvents } from '@/context/BookingEventContext';
import devLog from '@/utils/logger';

/**
 * Custom hook to manage lab-specific bookings
 * @param {string|number} labId - The ID of the lab to fetch bookings for
 * @param {boolean} autoFetch - Whether to automatically fetch on mount (default: true)
 * @returns {object} Lab bookings state and actions
 */
export function useLabBookings(labId, autoFetch = true) {
  const { 
    fetchLabBookings, 
    getLabBookings, 
    getCachedLabBookings,
    isLabBookingsLoaded 
  } = useBookings();
  
  const { processingReservations } = useReservationEvents();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetchTime, setLastFetchTime] = useState(0);
  const [hasFetched, setHasFetched] = useState(false);
  const [lastProcessingSize, setLastProcessingSize] = useState(0);

  const normalizedLabId = labId?.toString();

  // Get current bookings for the lab
  const labBookings = getLabBookings(normalizedLabId);
  const isLoaded = isLabBookingsLoaded(normalizedLabId);

  // Fetch lab bookings (internal wrapper)
  const fetchBookings = useCallback(async (force = false) => {
    if (!normalizedLabId) {
      devLog.warn('useLabBookings: No labId provided');
      return [];
    }

    // Avoid duplicate fetches
    if (loading && !force) {
      devLog.log(`useLabBookings: Already loading lab ${normalizedLabId}, skipping`);
      return getLabBookings(normalizedLabId);
    }

    // Check if we need to fetch
    const currentBookings = getLabBookings(normalizedLabId);
    if (!force && isLoaded && Array.isArray(currentBookings)) {
      devLog.log(`useLabBookings: Lab ${normalizedLabId} already loaded with ${currentBookings.length} bookings`);
      setHasFetched(true); // Mark as fetched even if from cache
      return currentBookings;
    }

    setLoading(true);
    setError(null);

    try {
      devLog.log(`useLabBookings: Fetching bookings for lab ${normalizedLabId}`);
      const bookings = await fetchLabBookings(normalizedLabId, force);
      setLastFetchTime(Date.now());
      setHasFetched(true); // Mark as successfully fetched
      devLog.log(`useLabBookings: Successfully fetched ${bookings.length} bookings for lab ${normalizedLabId}`);
      return bookings;
    } catch (err) {
      devLog.error(`useLabBookings: Error fetching lab ${normalizedLabId} bookings:`, err);
      setError(err.message || 'Failed to fetch lab bookings');
      setHasFetched(false); // Reset on error
      return [];
    } finally {
      setLoading(false);
    }
  }, [normalizedLabId, fetchLabBookings, loading, isLoaded, getLabBookings]);

  // Refresh bookings (force fetch)
  const refreshBookings = useCallback(() => {
    return fetchBookings(true);
  }, [fetchBookings]);

  // Auto-fetch on mount or labId change - SIMPLIFIED
  useEffect(() => {
    devLog.log(`useLabBookings: Auto-fetch effect triggered`, {
      autoFetch,
      normalizedLabId,
      hasFetched
    });
    
    if (autoFetch && normalizedLabId && !hasFetched) {
      devLog.log(`useLabBookings: Auto-fetching bookings for lab ${normalizedLabId}`);
      setHasFetched(true);
      
      // Use the context method directly to avoid circular dependencies
      fetchLabBookings(normalizedLabId, false).catch(error => {
        devLog.error(`useLabBookings: Auto-fetch failed for lab ${normalizedLabId}:`, error);
        setHasFetched(false); // Reset on error to allow retry
      });
    }
  }, [normalizedLabId, autoFetch, hasFetched, fetchLabBookings]); // Keep fetchLabBookings as it's stable

  // Reset hasFetched when lab changes
  useEffect(() => {
    setHasFetched(false);
    setError(null);
    setLoading(false);
    setLastProcessingSize(0); // Reset processing tracking
  }, [normalizedLabId]);

  // Handle processing reservations events
  useEffect(() => {
    const currentSize = processingReservations.size;
    
    // Only trigger refresh if:
    // 1. We had processing reservations and now we don't (completed processing)
    // 2. We have a valid lab and have fetched before
    if (lastProcessingSize > 0 && currentSize === 0 && normalizedLabId && hasFetched) {
      devLog.log(`useLabBookings: Processing completed for lab ${normalizedLabId} (${lastProcessingSize} -> ${currentSize})`);
      
      const timeoutId = setTimeout(() => {
        devLog.log(`useLabBookings: Event-triggered refresh executing for lab ${normalizedLabId}`);
        fetchBookings(true);
      }, 2000); // 2 seconds delay

      setLastProcessingSize(currentSize);
      return () => clearTimeout(timeoutId);
    }
    
    // Update tracking state
    if (currentSize !== lastProcessingSize) {
      setLastProcessingSize(currentSize);
    }
  }, [processingReservations.size, normalizedLabId, hasFetched, lastProcessingSize, fetchBookings]);

  // Check if bookings are fresh (less than 5 minutes old)
  const isFresh = useCallback(() => {
    if (!lastFetchTime) return false;
    const FRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes
    return (Date.now() - lastFetchTime) < FRESH_THRESHOLD;
  }, [lastFetchTime]);

  // Get bookings by status
  const getBookingsByStatus = useCallback((status) => {
    return labBookings.filter(booking => booking.status === status.toString());
  }, [labBookings]);

  // Get active bookings (status = 1)
  const getActiveBookings = useCallback(() => {
    return getBookingsByStatus(1);
  }, [getBookingsByStatus]);

  // Get pending bookings (status = 0)
  const getPendingBookings = useCallback(() => {
    return getBookingsByStatus(0);
  }, [getBookingsByStatus]);

  return {
    // Data
    bookings: labBookings,
    labBookings, // Alias for backwards compatibility
    bookingsCount: labBookings.length,
    
    // Status
    loading,
    isLoading: loading, // Alias for backwards compatibility
    error,
    isLoaded,
    isFresh: isFresh(),
    lastFetchTime,
    
    // Actions
    fetchBookings,
    refreshBookings,
    refetch: refreshBookings, // Alias for backwards compatibility
    
    // Utilities
    getBookingsByStatus,
    getActiveBookings,
    getPendingBookings,
    
    // Raw data access
    getCachedBookings: () => getCachedLabBookings(normalizedLabId),
  };
}

export default useLabBookings;
