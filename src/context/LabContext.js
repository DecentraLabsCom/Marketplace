import { createContext, useContext, useState, useEffect } from 'react';
import { usePublicClient, useReadContract } from 'wagmi';
import { fetchLabsData, subscribeToLabs, getLabs } from '../utils/fetchLabsData';
import { contractABI, contractAddress } from '../contracts/diamond';

const LabContext = createContext();

export function LabData({ children }) {
  const [labs, setLabs] = useState(getLabs() || []);
  const [loading, setLoading] = useState(true);

  // Added both to pass same status to LabCard and then to UserDashboardPage
  const [activeBookings, setActiveBooking] = useState({});
  const setBookingStatus = ({ labId, isActive }) => {
    setActiveBooking((prevBookings) => ({
      ...prevBookings,
      [labId]: isActive,
    }));
  };

  const contract = useReadContract({
    address: contractAddress,
    abi: contractABI,
    signerOrProvider: usePublicClient(),
  });

  useEffect(() => {
    fetchLabsData(contract); // Call fetchLabsData on mount

    const unsubscribe = subscribeToLabs((updatedLabs) => {
      setLabs(updatedLabs);
      setLoading(updatedLabs.length === 0);
    });

    return () => unsubscribe(); // Clean subscription on unmount
  }, []);

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