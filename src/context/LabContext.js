import { createContext, useContext, useState, useEffect } from 'react';
import { useUser } from './UserContext';

const LabContext = createContext();

export function LabData({ children }) {
  const [labs, setLabs] = useState([]);
  const [loading, setLoading] = useState(true);

  const { isLoggedIn, address, user, isSSO } = useUser();

  useEffect(() => {
    const fetchLabs = async () => {
      try {
        setLoading(true);

        const cachedLabs = sessionStorage.getItem('labs');
        if (cachedLabs) {
          setLabs(JSON.parse(cachedLabs));
          return;
        }

        const response = await fetch('/api/contract/getLabs');
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
    if (!address || labs.length === 0) return;

    const fetchBookings = async () => {
      try {
        const response = await fetch('/api/contract/getBookings', {
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
          const { labId, start, end, price, renter } = booking;
          if (!bookingsMap[labId]) {
            bookingsMap[labId] = [];
          }
          bookingsMap[labId].push({ start, end, price, renter });
        }

        const updatedLabs = labs.map((lab) => ({
          ...lab,
          bookings: bookingsMap[lab.id] || [],
        }));

        sessionStorage.setItem('labs', JSON.stringify(updatedLabs));
        setLabs(updatedLabs);
      } catch (err) {
        console.error('Error fetching reservations:', err);
      }
    };

    fetchBookings();
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
    <LabContext.Provider value={{ labs, loading }}> 
      {children}
    </LabContext.Provider>
  );
}

export function useLabs() {
  return useContext(LabContext);
}
