import { createContext, useContext, useState, useEffect } from 'react';
import { usePublicClient, useReadContract } from 'wagmi';
import { fetchLabsData, subscribeToLabs, getLabs } from '../utils/fetchLabsData';
import { contractABI, contractAddress } from '../contracts/bookings';

const LabContext = createContext();

export function LabData({ children }) {
  const [labs, setLabs] = useState(getLabs() || []);
  const [loading, setLoading] = useState(true);

  const contract = useReadContract({
    address: contractAddress,
    abi: contractABI,
    signerOrProvider: usePublicClient(),
  });

  useEffect(() => {
    fetchLabsData(); // Call fetchLabsData on mount

    const unsubscribe = subscribeToLabs((updatedLabs) => {
      setLabs(updatedLabs);
      setLoading(updatedLabs.length === 0);
    });

    return () => unsubscribe(); // Clean subscription on unmount
  }, []);

  return (
    <LabContext.Provider value={{ labs, loading }}>
      {children}
    </LabContext.Provider>
  );
}

export function useLabs() {
  return useContext(LabContext);
}