"use client";
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useUser } from '@/context/UserContext';
import { useLabToken } from '@/hooks/useLabToken';
import devLog from '@/utils/logger';

const LabContext = createContext();

function normalizeLab(rawLab) {
  return {
    id: String(rawLab.id ?? rawLab.labId ?? ""),
    name: rawLab.name ?? "",
    category: rawLab.category ?? "",
    keywords: Array.isArray(rawLab.keywords)
      ? rawLab.keywords
      : typeof rawLab.keywords === "string"
        ? rawLab.keywords.split(",").map(k => k.trim()).filter(Boolean)
        : [],
    price: typeof rawLab.price === "number"
      ? rawLab.price
      : parseFloat(rawLab.price ?? "0"),
    description: rawLab.description ?? "",
    provider: rawLab.provider ?? "",
    providerAddress: rawLab.providerAddress ?? "",
    auth: rawLab.auth ?? "",
    accessURI: rawLab.accessURI ?? "",
    accessKey: rawLab.accessKey ?? "",
    timeSlots: Array.isArray(rawLab.timeSlots)
      ? rawLab.timeSlots.map(Number).filter(Boolean)
      : typeof rawLab.timeSlots === "string"
        ? rawLab.timeSlots.split(",").map(Number).filter(Boolean)
        : [60],
    opens: rawLab.opens ?? "",
    closes: rawLab.closes ?? "",
    docs: Array.isArray(rawLab.docs)
      ? rawLab.docs
      : typeof rawLab.docs === "string"
        ? rawLab.docs.split(",").map(d => d.trim()).filter(Boolean)
        : [],
    images: Array.isArray(rawLab.images)
      ? rawLab.images
      : typeof rawLab.images === "string"
        ? rawLab.images.split(",").map(i => i.trim()).filter(Boolean)
        : [],
    uri: rawLab.uri ?? "",
    reservations: Array.isArray(rawLab.reservations) ? rawLab.reservations : [],
    bookingInfo: Array.isArray(rawLab.bookingInfo) ? rawLab.bookingInfo : [],
    userBookings: Array.isArray(rawLab.userBookings) ? rawLab.userBookings : [],
  };
}

export function LabData({ children }) {
  const [labs, setLabs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [lastBookingsFetch, setLastBookingsFetch] = useState(0);

  const { address } = useUser();
  const { decimals } = useLabToken();

  // Memoized cache keys
  const cacheKeys = useMemo(() => ({
    labs: 'labs',
    bookings: `bookings_${address || 'anonymous'}`,
    timestamp: 'labs_timestamp'
  }), [address]);

  // Optimized fetchLabs with better caching
  const fetchLabs = useCallback(async () => {
    setLoading(true);
    try {
      // Check cache with timestamp validation (30 minutes - increased to reduce API calls)
      const cachedLabs = sessionStorage.getItem(cacheKeys.labs);
      const cachedTimestamp = sessionStorage.getItem(cacheKeys.timestamp);
      const now = Date.now();
      
      if (cachedLabs && cachedTimestamp) {
        const age = now - parseInt(cachedTimestamp);
        if (age < 30 * 60 * 1000) { // 30 minutes
          setLabs(JSON.parse(cachedLabs));
          setLoading(false);
          return;
        }
      }

      const response = await fetch('/api/contract/lab/getAllLabs', {
        headers: {
          'Cache-Control': 'max-age=900' // 15 minutes to match server cache
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch labs: ${response.statusText}`);
      }
      
      const data = await response.json();
      const normalized = data.map(lab => normalizeLab(lab));

      // Update cache with timestamp
      sessionStorage.setItem(cacheKeys.labs, JSON.stringify(normalized));
      sessionStorage.setItem(cacheKeys.timestamp, now.toString());
      
      setLabs(normalized);
    } catch (err) {
      devLog.error('Error fetching labs:', err);
      // Try to use stale cache on error
      const cachedLabs = sessionStorage.getItem(cacheKeys.labs);
      if (cachedLabs) {
        setLabs(JSON.parse(cachedLabs));
      }
    } finally {
      setLoading(false);
    }
  }, [cacheKeys]);

  // fetchBookings with debouncing and smart caching
  const fetchBookings = useCallback(async (force = false) => {
    const now = Date.now();
    
    // Debounce: don't fetch if we just fetched within 30 seconds (unless forced)
    if (!force && now - lastBookingsFetch < 30000) {
      return;
    }

    setBookingsLoading(true);
    setLastBookingsFetch(now);

    try {
      // OPTIMIZATION: Fetch all bookings with timeout for RPC saturation scenarios
      devLog.log('Fetching all bookings with optimized single call...', { force });
      
      const controller = new AbortController();
      let timeoutId;
      
      // Use Promise.race with proper cleanup
      const fetchPromise = fetch(`/api/contract/reservation/getBookings${force ? '?clearCache=true' : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: null }), // Get all bookings
        signal: controller.signal
      });
      
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort('Request timeout');
          reject(new Error('Request timeout after 30 seconds'));
        }, 30000);
      });
      
      const response = await Promise.race([fetchPromise, timeoutPromise]);
      
      // Clear timeout if fetch succeeded
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const allBookingsData = await response.json();
      const cacheInfo = response.headers.get('X-Cache') || 'UNKNOWN';
      const fallbackInfo = response.headers.get('X-Fallback');
      
      devLog.log(`Fetched ${allBookingsData.length} total bookings (Cache: ${cacheInfo}${fallbackInfo ? `, Fallback: ${fallbackInfo}` : ''})`);
      
      // Show user notification if we're using fallback data
      if (fallbackInfo) {
        devLog.warn(`⚠️ Using fallback data due to RPC issues: ${fallbackInfo}`);
      }

      // Filter user bookings on the client side
      const userBookingsData = address 
        ? allBookingsData.filter(booking => 
            booking.renter && booking.renter.toLowerCase() === address.toLowerCase()
          )
        : [];
      
      devLog.log(`Filtered ${userBookingsData.length} user bookings for address: ${address}`);

      // Group bookings by labId
      const allBookingsMap = new Map();
      const userBookingsMap = new Map();

      for (const booking of allBookingsData) {
        if (!allBookingsMap.has(booking.labId)) {
          allBookingsMap.set(booking.labId, []);
        }
        allBookingsMap.get(booking.labId).push(booking);
      }

      for (const booking of userBookingsData) {
        if (!userBookingsMap.has(booking.labId)) {
          userBookingsMap.set(booking.labId, []);
        }
        userBookingsMap.get(booking.labId).push(booking);
      }

      // Update labs with booking data
      setLabs((prevLabs) => {
        const updatedLabs = prevLabs.map((lab) => ({
          ...lab,
          bookingInfo: allBookingsMap.get(lab.id) || [],
          userBookings: userBookingsMap.get(lab.id) || [],
        }));
        
        // Cache the updated labs
        sessionStorage.setItem(cacheKeys.labs, JSON.stringify(updatedLabs));
        return updatedLabs;
      });

    } catch (err) {
      devLog.error('Error fetching reservations:', err);
      
      // Enhanced error handling for AbortController and RPC issues
      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        devLog.warn('⚠️ Booking fetch was aborted - likely timeout or cancellation');
      } else if (err.message?.includes('Request timeout')) {
        devLog.warn('⚠️ Booking fetch timed out (30s) - likely RPC saturation');
      } else if (err.message?.includes('429')) {
        devLog.warn('⚠️ RPC rate limited (429) - servers are saturated');
      } else if (err.message?.includes('timeout')) {
        devLog.warn('⚠️ Request timeout - RPC may be overloaded');
      } else {
        devLog.error('Unexpected error:', err);
      }
      
      // Don't clear existing booking data on error, just log it
      // This preserves user experience when RPC is temporarily unavailable
      
      // Add user notification for timeout/abort errors
      if (err.name === 'AbortError' || err.message?.includes('aborted') || err.message?.includes('timeout')) {
        // Show user-friendly notification about RPC issues
        try {
          const { addTemporaryNotification } = require('@/context/NotificationContext');
          if (addTemporaryNotification) {
            addTemporaryNotification('warning', '⚠️ Network is slow - using cached data');
          }
        } catch {
          // Ignore notification errors
        }
      }
    } finally {
      setBookingsLoading(false);
    }
  }, [address, cacheKeys.labs, lastBookingsFetch]);

  // Efficiently remove a canceled booking without refetching all data
  const removeCanceledBooking = useCallback((reservationKey) => {
    setLabs((prevLabs) => {
      let hasChanges = false;
      const updatedLabs = prevLabs.map((lab) => {
        // Mark bookings as cancelled instead of removing them
        const updatedBookingInfo = lab.bookingInfo.map(booking => {
          if (booking.reservationKey === reservationKey) {
            hasChanges = true;
            return { ...booking, status: "4" }; // Mark as cancelled
          }
          return booking;
        });
        
        const updatedUserBookings = lab.userBookings.map(booking => {
          if (booking.reservationKey === reservationKey) {
            hasChanges = true;
            return { ...booking, status: "4" }; // Mark as cancelled
          }
          return booking;
        });

        // Only update if something changed
        if (hasChanges) {
          return {
            ...lab,
            bookingInfo: updatedBookingInfo,
            userBookings: updatedUserBookings,
          };
        }
        
        return lab;
      });

      // Only update cache if we actually made changes
      if (hasChanges) {
        sessionStorage.setItem(cacheKeys.labs, JSON.stringify(updatedLabs));
      }
      
      return updatedLabs;
    });
  }, [cacheKeys.labs]);

  // Restore booking to its original status when cancellation fails
  const restoreBookingStatus = useCallback((reservationKey, originalStatus) => {
    setLabs((prevLabs) => {
      let hasChanges = false;
      const updatedLabs = prevLabs.map((lab) => {
        // Restore booking status to original
        const updatedBookingInfo = lab.bookingInfo.map(booking => {
          if (booking.reservationKey === reservationKey) {
            hasChanges = true;
            return { ...booking, status: originalStatus };
          }
          return booking;
        });
        
        const updatedUserBookings = lab.userBookings.map(booking => {
          if (booking.reservationKey === reservationKey) {
            hasChanges = true;
            return { ...booking, status: originalStatus };
          }
          return booking;
        });

        // Only update if something changed
        if (hasChanges) {
          return {
            ...lab,
            bookingInfo: updatedBookingInfo,
            userBookings: updatedUserBookings,
          };
        }
        
        return lab;
      });

      // Only update cache if we actually made changes
      if (hasChanges) {
        sessionStorage.setItem(cacheKeys.labs, JSON.stringify(updatedLabs));
      }
      
      return updatedLabs;
    });
  }, [cacheKeys.labs]);

  // Remove all bookings/reservations for a specific lab when it's deleted
  const removeBookingsForDeletedLab = useCallback((deletedLabId) => {
    setLabs((prevLabs) => {
      let hasChanges = false;
      const updatedLabs = prevLabs.map((lab) => {
        // Remove all bookings and reservations that belong to the deleted lab
        const updatedBookingInfo = lab.bookingInfo.filter(
          booking => booking.labId !== deletedLabId
        );
        const updatedUserBookings = lab.userBookings.filter(
          booking => booking.labId !== deletedLabId
        );

        // Only update if something changed
        if (updatedBookingInfo.length !== lab.bookingInfo.length || 
            updatedUserBookings.length !== lab.userBookings.length) {
          hasChanges = true;
          return {
            ...lab,
            bookingInfo: updatedBookingInfo,
            userBookings: updatedUserBookings,
          };
        }
        
        return lab;
      });

      // Only update cache if we actually made changes
      if (hasChanges) {
        sessionStorage.setItem(cacheKeys.labs, JSON.stringify(updatedLabs));
      }
      
      return updatedLabs;
    });
  }, [cacheKeys.labs]);

  // Initial labs fetch
  useEffect(() => {
    fetchLabs();
  }, [fetchLabs]);

  // Smart bookings fetch - only when needed
  useEffect(() => {
    if (labs.length === 0) return;

    // If user logs out, clear user bookings immediately
    if (!address) {
      setLabs((prevLabs) =>
        prevLabs.map(lab => ({ 
          ...lab, 
          userBookings: [] 
        }))
      );
      return;
    }

    // Auto-fetch bookings when labs are loaded or user changes
    fetchBookings();
  }, [labs.length, address, fetchBookings]);

  // Memoized context value to prevent unnecessary re-renders
  // Clear cache and force refresh - useful for event-driven updates
  const clearCacheAndRefresh = useCallback(() => {
    sessionStorage.removeItem(cacheKeys.labs);
    sessionStorage.removeItem(cacheKeys.timestamp);
    fetchLabs();
  }, [cacheKeys, fetchLabs]);

  // Smart update function for event-driven changes
  const updateLabInState = useCallback((labId, updates) => {
    setLabs((prevLabs) => {
      const updatedLabs = prevLabs.map((lab) => {
        if (lab.id === labId) {
          // Note: price should come already normalized from API or events
          return { ...lab, ...updates };
        }
        return lab;
      });
      
      // Update cache with the new data
      sessionStorage.setItem(cacheKeys.labs, JSON.stringify(updatedLabs));
      return updatedLabs;
    });
  }, [cacheKeys.labs]);

  const contextValue = useMemo(() => ({
    labs,
    setLabs,
    loading,
    bookingsLoading,
    fetchLabs,
    fetchBookings,
    removeCanceledBooking,
    restoreBookingStatus,
    removeBookingsForDeletedLab,
    clearCacheAndRefresh,
    updateLabInState,
    // Keep existing function for backwards compatibility
    refreshLabs: () => {
      sessionStorage.removeItem(cacheKeys.labs);
      sessionStorage.removeItem(cacheKeys.timestamp);
      fetchLabs();
    }
  }), [labs, loading, bookingsLoading, fetchLabs, fetchBookings, removeCanceledBooking, restoreBookingStatus, removeBookingsForDeletedLab, clearCacheAndRefresh, updateLabInState, cacheKeys]);

  return (
    <LabContext.Provider value={contextValue}> 
      {children}
    </LabContext.Provider>
  );
}

export function useLabs() {
  const context = useContext(LabContext);
  if (!context) {
    throw new Error('useLabs must be used within a LabData');
  }
  return context;
}

// For backwards compatibility
export const LabProvider = LabData;
