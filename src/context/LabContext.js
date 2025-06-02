"use client";
import { createContext, useContext, useState, useEffect } from 'react';
import { useUser } from './UserContext';

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
      const response = await fetch('/api/contract/reservation/getBookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ wallet: address }),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch reservations: ${response.statusText}`);
      }

      const bookingsData = await response.json();

      const bookingsMap = {};
      for (const booking of bookingsData) {
        if (!bookingsMap[booking.labId]) {
          bookingsMap[booking.labId] = [];
        }
        bookingsMap[booking.labId].push(booking);
      }

      // TODO: Uncomment when testing things for real 
      setLabs((prevLabs) => {
        const updatedLabs = prevLabs.map((lab) => ({
          ...lab,
          bookingInfo: bookingsMap[lab.id] || [],
        }));
        sessionStorage.setItem('labs', JSON.stringify(updatedLabs));
        return updatedLabs;
      });

      // TODO: Remove the whole block below when testing things for real 
      // setLabs((prevLabs) => {
      //   const updatedLabs = prevLabs.map((lab) => {
      //     let forcedBooking = [];
      //     if (lab.id == 23 && bookingsData.length > 0) {
      //       forcedBooking = [bookingsData[0]];
      //     } else if (bookingsData.length > 4) {
      //       const randomIndex = Math.floor(Math.random() * 4) + 1; // 1, 2, 3, 4
      //       forcedBooking = [bookingsData[randomIndex]];
      //     }
      //     return {
      //       ...lab,
      //       bookingInfo: forcedBooking,
      //     };
      //   });
      //   sessionStorage.setItem('labs', JSON.stringify(updatedLabs));
      //   return updatedLabs;
      // });
    } catch (err) {
      console.error('Error fetching reservations:', err);
    }
  };

  useEffect(() => {
    if (!address) {
      // Clean bookingInfo if user is not logged in
      setLabs((prevLabs) =>
        prevLabs.map(lab => ({ ...lab, bookingInfo: [] }))
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