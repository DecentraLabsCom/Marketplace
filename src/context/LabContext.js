import { createContext, useContext, useState, useEffect } from 'react';
import { useReadContract, useAccount } from 'wagmi';
import { fetchLabsData, subscribeToLabs, getLabs } from '../utils/fetchLabsData';
import { selectChain } from '../utils/selectChain';
import { contractAddresses, contractABI, readOnlyABI, writeOnlyABI } from '../contracts/diamond';

const LabContext = createContext();

export function LabData({ children }) {
  const [labs, setLabs] = useState(getLabs() || []);
  const [loading, setLoading] = useState(true);
  const [hasFetched, setHasFetched] = useState(false);

  // Added both to pass same status to LabCard and then to UserDashboardPage
  const [activeBookings, setActiveBooking] = useState({});
  const setBookingStatus = ({ labId, isActive }) => {
    setActiveBooking((prevBookings) => ({
      ...prevBookings,
      [labId]: isActive,
    }));
  };

  const { chain: currentChain } = useAccount();
  const safeChain = selectChain(currentChain); 
  
  const { data: allCPSs, refetch, isLoading, error } = useReadContract({
    abi: contractABI,
    address: contractAddresses[safeChain.name.toLowerCase()],
    functionName: 'getAllCPSs',
    chainId: safeChain.id,
    query: {
      enabled: !hasFetched,
      retry: false,
      retryOnMount: false,
      refetchOnReconnect: false,
    }
  });

  useEffect(() => {
    if (allCPSs) {
      setHasFetched(true);
      setLoading(false);
      console.log(allCPSs);
    }
  }, [allCPSs, refetch, isLoading, error]);

  useEffect(() => {
    fetchLabsData(); // Call fetchLabsData on mount

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