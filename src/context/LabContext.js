import { createContext, useContext, useState, useEffect } from 'react';
//import { useDefaultReadContract } from '../hooks/useDefaultReadContract';

const LabContext = createContext();

export function LabData({ children }) {
  const [labs, setLabs] = useState([]);
  const [loading, setLoading] = useState(true);
  //const [hasFetched, setHasFetched] = useState(false);

  // Added both to pass same status to LabCard and then to UserDashboardPage
  const [activeBookings, setActiveBooking] = useState({});
  const setBookingStatus = ({ labId, isActive }) => {
    setActiveBooking((prevBookings) => ({
      ...prevBookings,
      [labId]: isActive,
    }));
  };

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

  /*const { data: labList, refetch, isLoading, error } = 
        useDefaultReadContract('getAllCPSs', null, hasFetched);

  useEffect(() => {
    if (labList) {
      setHasFetched(true);
      console.log(labList);
    }
  }, [labList, refetch, isLoading, error]);*/

  // Added activeBookings and setBookingStatus
  return (
    <LabContext.Provider value={{ labs, loading, activeBookings, setBookingStatus }}>
      {children}
    </LabContext.Provider>
  );
}

export function useLabs() {
  return useContext(LabContext);
}