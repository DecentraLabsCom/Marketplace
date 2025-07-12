"use client";
import { createContext, useContext, useState, useEffect } from 'react';
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
  };
}

export function LabData({ children }) {
  const [labs, setLabs] = useState([]);
  const [loading, setLoading] = useState(true);

  const { isLoggedIn, address, user, isSSO } = useUser();

  const fetchLabs = async () => {
    setLoading(true);
    try {
      const cachedLabs = sessionStorage.getItem('labs');
      if (cachedLabs) {
        setLabs(JSON.parse(cachedLabs));
        return;
      }

      const response = await fetch('/api/contract/lab/getAllLabs');
      if (!response.ok) {
        throw new Error(`Failed to fetch labs: ${response.statusText}`);
      }
      const data = await response.json();
      const normalized = data.map(normalizeLab);

      sessionStorage.setItem('labs', JSON.stringify(normalized));
      setLabs(normalized);
    } catch (err) {
      console.error('Error fetching labs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLabs();
  }, []);

  const fetchBookings = async () => {
    try {
      // Fetch user's bookings (only if user is logged in)
      let userBookingsData = [];
      if (address) {
        const userResponse = await fetch('/api/contract/reservation/getBookings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ wallet: address }),
        });

        if (!userResponse.ok) {
          throw new Error(`Failed to fetch user reservations: ${userResponse.statusText}`);
        }

        userBookingsData = await userResponse.json();
      }

      // Fetch all bookings for calendar display
      const allResponse = await fetch('/api/contract/reservation/getBookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ wallet: null }), // Get all bookings
      });

      if (!allResponse.ok) {
        throw new Error(`Failed to fetch all reservations: ${allResponse.statusText}`);
      }

      const allBookingsData = await allResponse.json();

      // Group all bookings by labId for calendar display
      const allBookingsMap = {};
      for (const booking of allBookingsData) {
        if (!allBookingsMap[booking.labId]) {
          allBookingsMap[booking.labId] = [];
        }
        allBookingsMap[booking.labId].push(booking);
      }

      // Group user bookings by labId for user dashboard
      const userBookingsMap = {};
      for (const booking of userBookingsData) {
        if (!userBookingsMap[booking.labId]) {
          userBookingsMap[booking.labId] = [];
        }
        userBookingsMap[booking.labId].push(booking);
      }

      setLabs((prevLabs) => {
        const updatedLabs = prevLabs.map((lab) => ({
          ...lab,
          bookingInfo: allBookingsMap[lab.id] || [], // All bookings for calendar
          userBookings: userBookingsMap[lab.id] || [], // User bookings for dashboard
        }));
        sessionStorage.setItem('labs', JSON.stringify(updatedLabs));
        return updatedLabs;
      });
    } catch (err) {
      console.error('Error fetching reservations:', err);
      // Fallback to empty arrays on error
      setLabs((prevLabs) =>
        prevLabs.map(lab => ({ 
          ...lab, 
          bookingInfo: [], 
          userBookings: [] 
        }))
      );
    }
  };

  useEffect(() => {
    if (!address) {
      // Clean bookingInfo and userBookings if user is not logged in
      setLabs((prevLabs) =>
        prevLabs.map(lab => ({ 
          ...lab, 
          bookingInfo: [], 
          userBookings: [] 
        }))
      );
      return;
    }
    if (labs.length > 0) fetchBookings();
  }, [address, labs.length]); 

  return (
    <LabContext.Provider value={{ labs, setLabs, loading, fetchLabs, fetchBookings }}> 
      {children}
    </LabContext.Provider>
  );
}

export function useLabs() {
  const ctx = useContext(LabContext);
  if (!ctx) throw new Error("useLabs must be used within a LabData provider");
  return ctx;
}