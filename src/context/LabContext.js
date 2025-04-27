import { createContext, useContext, useState, useEffect } from 'react';
import { useUser } from './UserContext';
//import { useDefaultReadContract } from '../hooks/useDefaultReadContract';

const LabContext = createContext();

export function LabData({ children }) {
  const [labs, setLabs] = useState([]);
  const [loading, setLoading] = useState(true);
  //const [hasFetched, setHasFetched] = useState(false);

  const { isLoggedIn, address, user, isSSO } = useUser();

  useEffect(() => {
    const fetchLabs = async () => {
      setLoading(true);
      try {
        const cachedLabs = sessionStorage.getItem('labs');
        if (cachedLabs) {
          setLabs(JSON.parse(cachedLabs));
          return;
        }

        const response = await fetch('/api/contract/lab/getLabs');
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

    fetchLabs();
  }, []);

  useEffect(() => {
    if (!address) {
      // Clean bookingInfo if user is not logged in
      setLabs((prevLabs) =>
        prevLabs.map(lab => ({ ...lab, bookingInfo: [] }))
      );
      return;
    }
  
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

        setLabs((prevLabs) => {
          const updatedLabs = prevLabs.map((lab) => ({
            ...lab,
            bookingInfo: bookingsMap[lab.id] || [],
          }));
          sessionStorage.setItem('labs', JSON.stringify(updatedLabs));
          return updatedLabs;
        });
      } catch (err) {
        console.error('Error fetching reservations:', err);
      }
    };
  
    if (labs.length > 0) fetchBookings();
  }, [address]); 

  /*const { data: labList, refetch, isLoading, error } = 
        useDefaultReadContract('getAllLabs', null, hasFetched);

  useEffect(() => {
    if (labList) {
      setHasFetched(true);
      console.log(labList);
    }
  }, [labList, refetch, isLoading, error]);*/

  return (
    <LabContext.Provider value={{ labs, loading }}> 
      {children}
    </LabContext.Provider>
  );
}

export function useLabs() {
  return useContext(LabContext);
}