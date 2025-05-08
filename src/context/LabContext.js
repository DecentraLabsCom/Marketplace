"use client";
import { createContext, useContext, useState, useEffect } from 'react';
import { useUser } from './UserContext';
//import useDefaultReadContract from '../hooks/contract/useDefaultReadContract';

const LabContext = createContext();

export function LabData({ children }) {
  const [labs, setLabs] = useState([]);
  const [loading, setLoading] = useState(true);
  //const [hasFetched, setHasFetched] = useState(false);

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

      sessionStorage.setItem('labs', JSON.stringify(data));
      setLabs(data);
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
      /*setLabs((prevLabs) => {
        const updatedLabs = prevLabs.map((lab) => ({
          ...lab,
          bookingInfo: bookingsMap[lab.id] || [],
        }));
        sessionStorage.setItem('labs', JSON.stringify(updatedLabs));
        return updatedLabs;
      });*/

      // TODO: Remove the whole block below when testing things for real 
      setLabs((prevLabs) => {
        const updatedLabs = prevLabs.map((lab) => {
          let forcedBooking = [];
          if (lab.id == 23 && bookingsData.length > 0) {
            forcedBooking = [bookingsData[0]];
          } else if (bookingsData.length > 4) {
            const randomIndex = Math.floor(Math.random() * 4) + 1; // 1, 2, 3, 4
            forcedBooking = [bookingsData[randomIndex]];
          }
          return {
            ...lab,
            bookingInfo: forcedBooking,
          };
        });
        sessionStorage.setItem('labs', JSON.stringify(updatedLabs));
        return updatedLabs;
      });
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

  /*const { data: labList, refetch, isLoading, error } = 
        useDefaultReadContract('getAllLabs', null, hasFetched);

  useEffect(() => {
    if (labList) {
      setHasFetched(true);
      console.log(labList);
    }
  }, [labList, refetch, isLoading, error]);*/

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