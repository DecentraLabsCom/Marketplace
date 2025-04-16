import { createContext, useContext, useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
//import { useDefaultReadContract } from '../hooks/useDefaultReadContract';

const LabContext = createContext();

export function LabData({ children }) {
  const [labs, setLabs] = useState([]);
  const [loading, setLoading] = useState(true);
  //const [hasFetched, setHasFetched] = useState(false);

  const { address } = useAccount();

  useEffect(() => {
    const fetchLabs = async () => {
      try {
        setLoading(true);

        // Check whether the data is already available in sessionStorage
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
        
        setLabs((prevLabs) => {
          const updatedLabs = prevLabs.map((lab) => {
            const booking = bookingsData.find((b) => b.labId === lab.id);
            return {
              ...lab,
              activeBooking: booking ? booking.activeBooking : false,
            };
          });

          sessionStorage.setItem('labs', JSON.stringify(updatedLabs));
          return updatedLabs;
        });
      } catch (err) {
        console.error('Error fetching reservations:', err);
      }
    };

    if (labs.length > 0) {
      fetchBookings();
    }
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
    <LabContext.Provider value={{ labs, loading }}>
      {children}
    </LabContext.Provider>
  );
}

export function useLabs() {
  return useContext(LabContext);
}