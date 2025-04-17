import { createContext, useContext, useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
//import { useDefaultReadContract } from '../hooks/useDefaultReadContract';

const LabContext = createContext();

export function LabData({ children }) {
  const [labs, setLabs] = useState([]);
  const [bookings, setBookings] = useState([]); 
  const [loading, setLoading] = useState(true);
  //const [hasFetched, setHasFetched] = useState(false);

  const { address } = useAccount();

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
    if (!address) return;
  
    const fetchBookings = async () => {
      try {
        const response = await fetch('/api/contract/getBookings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userWallet: address }),
        });
  
        if (!response.ok) {
          throw new Error(`Failed to fetch reservations: ${response.statusText}`);
        }
  
        const bookingsData = await response.json();
        setBookings(bookingsData);
  
        // solo si labs ya están disponibles
        setLabs((prevLabs) => {
          if (!prevLabs.length) return prevLabs;
  
          const updated = prevLabs.map((lab) => {
            const booking = bookingsData.find((b) => b.labId === lab.id);
            return {
              ...lab,
              activeBooking: booking ? booking.activeBooking : false,
            };
          });
  
          sessionStorage.setItem('labs', JSON.stringify(updated));
          return updated;
        });
      } catch (err) {
        console.error('Error fetching reservations:', err);
      }
    };
  
    fetchBookings();
  }, [address]); 

  /*const { data: labList, refetch, isLoading, error } = 
        useDefaultReadContract('getAllCPSs', null, hasFetched);

  useEffect(() => {
    if (labList) {
      setHasFetched(true);
      console.log(labList);
    }
  }, [labList, refetch, isLoading, error]);*/

  return (
    <LabContext.Provider value={{ labs, bookings, loading }}> 
      {children}
    </LabContext.Provider>
  );
}

export function useLabs() {
  return useContext(LabContext);
}
