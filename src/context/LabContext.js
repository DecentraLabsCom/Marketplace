"use client";
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useUser } from '@/context/UserContext';

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

  const { isLoggedIn, address, user, isSSO } = useUser();

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
          console.log('Using cached labs data');
          setLabs(JSON.parse(cachedLabs));
          setLoading(false);
          return;
        }
      }

      console.log('Fetching fresh labs data...');
      const response = await fetch('/api/contract/lab/getAllLabs', {
        headers: {
          'Cache-Control': 'max-age=900' // 15 minutes to match server cache
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch labs: ${response.statusText}`);
      }
      
      const data = await response.json();
      const normalized = data.map(normalizeLab);

      // Update cache with timestamp
      sessionStorage.setItem(cacheKeys.labs, JSON.stringify(normalized));
      sessionStorage.setItem(cacheKeys.timestamp, now.toString());
      
      setLabs(normalized);
    } catch (err) {
      console.error('Error fetching labs:', err);
      // Try to use stale cache on error
      const cachedLabs = sessionStorage.getItem(cacheKeys.labs);
      if (cachedLabs) {
        console.log('Using stale cache due to error');
        setLabs(JSON.parse(cachedLabs));
      }
    } finally {
      setLoading(false);
    }
  }, [cacheKeys]);

  // fetchBookings with debouncing and smart caching
  const fetchBookings = useCallback(async () => {
    const now = Date.now();
    
    // Debounce: don't fetch if we just fetched within 30 seconds
    if (now - lastBookingsFetch < 30000) {
      console.log('Skipping bookings fetch - too recent');
      return;
    }

    setBookingsLoading(true);
    setLastBookingsFetch(now);

    try {
      // Fetch both user and all bookings in parallel (only one API call each)
      const fetchPromises = [];
      
      // Only fetch user bookings if logged in
      if (address) {
        fetchPromises.push(
          fetch('/api/contract/reservation/getBookings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet: address }),
          }).then(r => r.ok ? r.json() : [])
        );
      } else {
        fetchPromises.push(Promise.resolve([]));
      }

      // Always fetch all bookings for calendar availability
      fetchPromises.push(
        fetch('/api/contract/reservation/getBookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: null }),
        }).then(r => r.ok ? r.json() : [])
      );

      const [userBookingsData, allBookingsData] = await Promise.all(fetchPromises);

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
      console.error('Error fetching reservations:', err);
      // Don't clear existing booking data on error, just log it
    } finally {
      setBookingsLoading(false);
    }
  }, [address, cacheKeys.labs, lastBookingsFetch]);

  // Efficiently remove a canceled booking without refetching all data
  const removeCanceledBooking = useCallback((reservationKey) => {
    setLabs((prevLabs) => {
      let hasChanges = false;
      const updatedLabs = prevLabs.map((lab) => {
        // Remove from both bookingInfo and userBookings arrays
        const updatedBookingInfo = lab.bookingInfo.filter(
          booking => booking.reservationKey !== reservationKey
        );
        const updatedUserBookings = lab.userBookings.filter(
          booking => booking.reservationKey !== reservationKey
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
        
        if (process.env.NODE_ENV === 'development') {
          console.log('Removed booking with reservationKey:', reservationKey);
        }
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
  const contextValue = useMemo(() => ({
    labs,
    setLabs,
    loading,
    bookingsLoading,
    fetchLabs,
    fetchBookings,
    removeCanceledBooking,
    refreshLabs: () => {
      sessionStorage.removeItem(cacheKeys.labs);
      sessionStorage.removeItem(cacheKeys.timestamp);
      fetchLabs();
    }
  }), [labs, loading, bookingsLoading, fetchLabs, fetchBookings, removeCanceledBooking, cacheKeys]);

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
