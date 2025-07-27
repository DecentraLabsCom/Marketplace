"use client";
import { useEffect, useState } from 'react'
import { parseUnits } from 'viem'
import { useWaitForTransactionReceipt } from 'wagmi'
import { useUser } from '@/context/UserContext'
import { useNotifications } from '@/context/NotificationContext'
import { 
  useAllLabsQuery, 
  useCreateLabMutation, 
  useUpdateLabMutation, 
  useDeleteLabMutation, 
  useToggleLabStatusMutation 
} from '@/hooks/lab/useLabs'
import { useLabBookingsQuery } from '@/hooks/booking/useBookings'
import { useLabToken } from '@/hooks/useLabToken'
import { useLabEventCoordinator } from '@/hooks/lab/useLabEventCoordinator'
import useContractWriteFunction from '@/hooks/contract/useContractWriteFunction'
import { useReservationEventCoordinator } from '@/hooks/booking/useBookingEventCoordinator'
import LabModal from '@/components/provider/LabModal'
import AccessControl from '@/components/auth/AccessControl'
import ProviderLabItem from '@/components/provider/ProviderLabItem'
import CalendarWithBookings from '@/components/booking/CalendarWithBookings'
import devLog from '@/utils/dev/logger'

export default function ProviderDashboard() {
  const { address, user, isSSO } = useUser();
  
  // 🚀 React Query for labs
  const { 
    data: labs = [], 
    isLoading: loading, 
    isError: labsError,
    error: labsErrorDetails 
  } = useAllLabsQuery({
    staleTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false, // No automatic refetch
  });

  const { addTemporaryNotification, addPersistentNotification } = useNotifications();
  const { coordinatedLabUpdate } = useLabEventCoordinator();
  const { invalidateUserBookingsByLab } = useReservationEventCoordinator();
  const { decimals } = useLabToken();

  // 🚀 React Query mutations for lab management
  const createLabMutation = useCreateLabMutation();
  const updateLabMutation = useUpdateLabMutation();
  const deleteLabMutation = useDeleteLabMutation();
  const toggleLabStatusMutation = useToggleLabStatusMutation();
  
  // State declarations
  const [ownedLabs, setOwnedLabs] = useState([]);
  const [selectedLabId, setSelectedLabId] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // 🚀 React Query for lab bookings
  const { 
    data: labBookings = [], 
    isLoading: bookingsLoading, 
    isError: bookingsError,
    error: bookingsErrorDetails 
  } = useLabBookingsQuery(selectedLabId, null, null, {
    enabled: !!selectedLabId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  // Contract write functions
  const { contractWriteFunction: addLab } = useContractWriteFunction('addLab');  
  const { contractWriteFunction: deleteLab } = useContractWriteFunction('deleteLab');
  const { contractWriteFunction: updateLab } = useContractWriteFunction('updateLab');
  const { contractWriteFunction: listLab } = useContractWriteFunction('listLab');
  const { contractWriteFunction: unlistLab } = useContractWriteFunction('unlistLab');

  // Transaction state management
  const [lastTxHash, setLastTxHash] = useState(null);
  const [txType, setTxType] = useState(null); // 'add', 'update', 'delete', 'list', 'unlist'
  const [pendingData, setPendingData] = useState(null);

  // Wait for transaction receipt
  const { 
    data: receipt, 
    isSuccess: isReceiptSuccess 
  } = useWaitForTransactionReceipt({
    hash: lastTxHash,
    enabled: !!lastTxHash
  });

  const newLabStructure = {
    name: '', category: '', keywords: [], price: '', description: '',
    provider: '', auth: '', accessURI: '', accessKey: '', timeSlots: [],
    opens: '', closes: '', docs: [], images: [], uri: ''
  };
  const [newLab, setNewLab] = useState(newLabStructure);
  const maxId = labs.length > 0 ? Math.max(...labs.map(lab => lab.id || 0)) : 0;

  // Handle transaction confirmation
  useEffect(() => {
    if (isReceiptSuccess && receipt && txType && pendingData) {
      
      addPersistentNotification('success', `✅ ${txType.charAt(0).toUpperCase() + txType.slice(1)} operation confirmed onchain!`);
      
      // 🚀 React Query mutations will automatically update the cache
      // through invalidation and optimistic updates - no manual state management needed
      switch(txType) {
        case 'add':
          // createLabMutation already handles cache updates
          setIsModalOpen(false); // Only close for new labs
          break;
        case 'update':
          // updateLabMutation already handles cache updates
          devLog.log('ProviderDashboard: Lab updated via React Query, modal remains open');
          break;
        case 'delete':
          // deleteLabMutation already handles cache updates
          break;
        case 'list':
        case 'unlist':
          // toggleLabStatusMutation already handles cache updates
          break;
      }
      
      // Reset transaction state
      setLastTxHash(null);
      setTxType(null);
      setPendingData(null);
    }
  }, [isReceiptSuccess, receipt, txType, pendingData, addPersistentNotification]); // Removed 'labs' dependency

  const selectedLab = ownedLabs.find(lab => String(lab.id) === String(selectedLabId));
  
  // Ensure we have a valid lab object to pass to the modal
  const modalLab = selectedLab ? selectedLab : (selectedLabId ? null : newLab);
  const shouldShowModal = isModalOpen && modalLab;
  
  const bookingInfo = (selectedLab && labBookings && !bookingsError) 
    ? labBookings.map(booking => ({
        ...booking,
        labName: selectedLab.name,
        status: booking.status
      }))
    : [];

  // Calendar
  const today = new Date();
  const [date, setDate] = useState(new Date());

  // Filter labs owned by the user (with memoization-like effect)
  useEffect(() => {
    if (address && labs && labs.length > 0) {
      const userLabs = labs.filter((lab) => lab.providerAddress === String(address));
      
      // Only update if there's actually a change to prevent loops
      setOwnedLabs(prevLabs => {
        if (prevLabs.length !== userLabs.length) return userLabs;
        
        const hasChanged = userLabs.some((lab, index) => lab.id !== prevLabs[index]?.id);
        return hasChanged ? userLabs : prevLabs;
      });
    }
  }, [address, labs]);

  // Automatically set the first lab as the selected lab (only once)
  const hasOwnedLabs = ownedLabs.length > 0;
  useEffect(() => {
    if (hasOwnedLabs && !selectedLabId && !isModalOpen) {
      setSelectedLabId(ownedLabs[0].id);
    }
  }, [hasOwnedLabs, selectedLabId, isModalOpen]); // Removed 'ownedLabs' to prevent loops

  // Handle saving a lab (either when editing an existing one or adding a new one)
  const handleSaveLab = async (labData) => {
    // Store the original human-readable price for local state updates
    const originalPrice = labData.price;
    
    // Convert price from user input to token units for blockchain operations
    if (labData.price && decimals) {
      try {
        // Convert hourly price (UI) to per-second price (contract format)
        const pricePerHour = parseFloat(labData.price.toString());
        const pricePerSecond = pricePerHour / 3600; // Convert to per-second
        
        // Convert the per-second price to token units (multiply by decimals)
        const priceInTokenUnits = parseUnits(pricePerSecond.toString(), decimals);
        labData = { ...labData, price: priceInTokenUnits.toString() };
      } catch (error) {
        devLog.error('Error converting price to token units:', error);
        addTemporaryNotification('error', '❌ Invalid price format. Please enter a valid number.');
        return;
      }
    }
    
    if (labData.id) {
      await handleEditLab({ labData, originalPrice });
    } else {
      await handleAddLab({ labData });
    }
  };

  // Handle editing/updating a lab
  async function handleEditLab({ labData, originalPrice }) {
    labData.uri = labData.uri || `Lab-${user.name}-${labData.id}.json`;
    const originalLab = labs.find(lab => lab.id == labData.id);

    const wasLocalJson = originalLab.uri && originalLab.uri.startsWith('Lab-');
    const isNowExternal = labData.uri && (labData.uri.startsWith('http://') || 
                          labData.uri.startsWith('https://'));
    const mustDeleteOldJson = wasLocalJson && isNowExternal;

    const hasChangedOnChainData =
      originalLab.uri !== labData.uri ||
      originalLab.price !== labData.price ||
      originalLab.auth !== labData.auth ||
      originalLab.accessURI !== labData.accessURI ||
      originalLab.accessKey !== labData.accessKey;

    // Use coordinated update to prevent collisions with blockchain events
    await coordinatedLabUpdate(async () => {

    try {
      // 1. Update lab data
      if (hasChangedOnChainData) {
        // 1a. If there is any change in the on-chain data, update blockchain
        addTemporaryNotification('pending', '⏳ Updating lab onchain...');

        let txHash;
        
        if (isSSO) {
          // For SSO users, use server-side transaction with unique provider wallet
          const response = await fetch('/api/contract/lab/updateLabSSO', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              email: user.email,
              labId: labData.id,
              labData: {
                uri: labData.uri,
                price: labData.price,
                auth: labData.auth,
                accessURI: labData.accessURI,
                accessKey: labData.accessKey
              }
            }),
          });
          
          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update lab');
          }
          
          const result = await response.json();
          txHash = result.txHash;
        } else {
          // For wallet users, use client-side transaction
          txHash = await updateLab([
            labData.id,
            labData.uri,
            labData.price,
            labData.auth,
            labData.accessURI,
            labData.accessKey
          ]);
        }
        
        if (txHash) {
          setLastTxHash(txHash);
          setTxType('update');
          // Store pending data with per-second price
          const pricePerHour = parseFloat(originalPrice);
          const pricePerSecond = pricePerHour / 3600;
          setPendingData({ ...labData, price: pricePerSecond });
        } else {
          throw new Error('No transaction hash received');
        }
        } else {
        // 1b. If there is no change in the on-chain data, just update via React Query
        // Keep price in human-readable format for consistency
        updateLabMutation.mutate({
          labId: labData.id,
          labData: { ...labData, price: originalPrice }
        });
        // DON'T close modal - let user close it manually
        addTemporaryNotification('success', '✅ Lab updated successfully (offchain changes only)!');
        devLog.log('ProviderDashboard: Lab updated via React Query (offchain), modal remains open');
      }      // 2. Save the JSON if necessary
      if (labData.uri.startsWith('Lab-')) {
        try {
          const response = await fetch('/api/provider/saveLabData', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // Save with human-readable price for JSON consistency
            body: JSON.stringify({ labData: { ...labData, price: originalPrice } }),
          });
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        } catch (error) {
          addTemporaryNotification('error', `❌ Failed to save lab data: ${formatErrorMessage(error)}`);
          return;
        }
      }

      // 3. Delete the old JSON if necessary
      if (mustDeleteOldJson) {
        await fetch('/api/provider/deleteLabData', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ labURI: originalLab.uri }),
        });
      }
    } catch (error) {
      devLog.error('Error updating lab:', error);
      addTemporaryNotification('error', `❌ Failed to update lab: ${formatErrorMessage(error)}`);
      throw error; // Re-throw for coordinatedLabUpdate to handle
    }
    }, labData.id); // End of coordinatedLabUpdate - pass labId for targeted cache invalidation
  }

  // Handle adding a new lab using React Query mutation
  async function handleAddLab({ labData }) {
    const maxId = labs.length > 0 ? Math.max(...labs.map(lab => lab.id || 0)) : 0;
    labData.uri = labData.uri || `Lab-${user.name}-${maxId + 1}.json`;

    try {
      addTemporaryNotification('pending', '⏳ Adding lab...');
      
      // 🚀 Use React Query mutation for lab creation
      await createLabMutation.mutateAsync({
        ...labData,
        providerId: address, // Add provider info
        isSSO,
        userEmail: user.email
      });
      
      addTemporaryNotification('success', '✅ Lab added successfully!');
      setIsModalOpen(false);
      
    } catch (error) {
      devLog.error('Error adding lab:', error);
      addTemporaryNotification('error', `❌ Failed to add lab: ${error.message}`);
    }
  }

  // Handle delete a lab using React Query mutation
  const handleDeleteLab = async (labId) => {
    try {
      addTemporaryNotification('pending', '⏳ Deleting lab...');

      // 🚀 Use React Query mutation for lab deletion
      await deleteLabMutation.mutateAsync(labId);
      
      addTemporaryNotification('success', '✅ Lab deleted successfully!');

      // Clean up all bookings for this deleted lab using React Query
      devLog.log('🗑️ Cleaning up all bookings for deleted lab:', labId);
      
      // The useBookingCacheInvalidation will handle cache cleanup
      await invalidateUserBookingsByLab(labId);
      devLog.log('✅ Successfully cleaned up all bookings for deleted lab:', labId);
      
      addTemporaryNotification('warning', 
        `⚠️ Lab deleted successfully. All associated reservations have been automatically cancelled.`
      );

    } catch (error) {
      devLog.error('Error deleting lab:', error);
      addTemporaryNotification('error', `❌ Failed to delete lab: ${error.message}`);
    }
  };

  // Handle listing a lab using React Query mutation
  const handleList = async (labId) => {
    try {
      addTemporaryNotification('pending', '⏳ Listing lab...');

      // 🚀 Use React Query mutation for lab status toggle
      await toggleLabStatusMutation.mutateAsync({ labId, isListed: true });
      
      addTemporaryNotification('success', '✅ Lab listed successfully!');
    } catch (error) {
      devLog.error('Error listing lab:', error);
      addTemporaryNotification('error', `❌ Failed to list lab: ${error.message}`);
    }
  };
  
  // Handle unlisting a lab using React Query mutation
  const handleUnlist = async (labId) => {
    try {
      addTemporaryNotification('pending', '⏳ Unlisting lab...');

      // 🚀 Use React Query mutation for lab status toggle
      await toggleLabStatusMutation.mutateAsync({ labId, isListed: false });
      
      addTemporaryNotification('success', '✅ Lab unlisted successfully!');
    } catch (error) {
      devLog.error('Error unlisting lab:', error);
      addTemporaryNotification('error', `❌ Failed to unlist lab: ${error.message}`);
    }
  };

  // Handle collecting balances from all labs
  const handleCollectAll = async () => {
    try {
      addTemporaryNotification('pending', '⏳ Collecting all balances...');
      
      const res = await fetch('/api/contract/reservation/claimAllBalance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });
      if (!res.ok) throw new Error('Failed to collect balance');
      
      addTemporaryNotification('success', '✅ All balances collected successfully!');
    } catch (err) {
      devLog.error(err);
      addTemporaryNotification('error', `❌ Failed to collect balances: ${formatErrorMessage(err)}`);
    }
  };
  
  // Handle collecting balance from a specific lab
  const handleCollect = async (labId) => {
    try {
      addTemporaryNotification('pending', '⏳ Collecting lab balance...');
      
      const res = await fetch('/api/contract/reservation/claimLabBalance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, labId }),
      });
      if (!res.ok) throw new Error('Failed to collect balance');
      
      addTemporaryNotification('success', '✅ Balance collected successfully!');
    } catch (err) {
      devLog.error(err);
      addTemporaryNotification('error', `❌ Failed to collect balance: ${formatErrorMessage(err)}`);
    }
  };

  const handleSelectChange = (e) => {
    setSelectedLabId(e.target.value);
  };

  // Helper function to clean and shorten error messages
  const formatErrorMessage = (error) => {
    let message = error.message || 'Unknown error';
    
    // Common patterns to simplify
    const patterns = [
      { regex: /execution reverted:?\s*/i, replacement: '' },
      { regex: /VM Exception while processing transaction:?\s*/i, replacement: '' },
      { regex: /Error:\s*/i, replacement: '' },
      { regex: /Failed to.*?:\s*/i, replacement: '' },
      { regex: /HTTP error! status: (\d+)/, replacement: 'Server error ($1)' },
      { regex: /network.*?error/i, replacement: 'Network error' },
      { regex: /insufficient.*?funds/i, replacement: 'Insufficient funds' },
      { regex: /user.*?rejected/i, replacement: 'Transaction rejected' },
      { regex: /wallet.*?connection/i, replacement: 'Wallet error' }
    ];
    
    // Apply patterns
    patterns.forEach(({ regex, replacement }) => {
      message = message.replace(regex, replacement);
    });
    
    // Truncate if still too long
    if (message.length > 80) {
      message = message.substring(0, 77) + '...';
    }
    
    return message.trim() || 'Operation failed';
  };

  // ❌ Error handling for React Query
  if (labsError) {
    return (
      <AccessControl requireWallet message="Please log in to manage your labs.">
        <div className="container mx-auto p-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md mx-auto">
            <h2 className="text-red-800 text-xl font-semibold mb-2">Error Loading Labs</h2>
            <p className="text-red-600 mb-4">
              {labsErrorDetails?.message || 'Failed to load laboratory data'}
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </AccessControl>
    );
  }

  return (
    <AccessControl requireWallet message="Please log in to manage your labs.">
      <div className="container mx-auto p-4">
        <div className="relative bg-cover bg-center text-white py-5 text-center">
          <h1 className="text-3xl font-bold mb-2">Lab Panel</h1>
        </div>

        <div className="flex flex-col min-[1080px]:flex-row">

          <div className="w-full min-[1080px]:w-2/3">
            <h2 className="text-xl font-semibold mb-4 text-center">Your Labs</h2>
            {loading ? (
              <p className="text-gray-300 text-center">Loading labs...</p>
            ) : ownedLabs.length > 0 ? (
              <>
              <div className="flex justify-center mb-4">
                <button onClick={handleCollectAll}
                  className="bg-[#bcc4fc] text-white px-6 py-2 rounded shadow hover:bg-[#aab8e6] 
                            font-bold"
                >
                  Collect All
                </button>
              </div>
              <div className="flex justify-center">
                <select className="w-full p-3 border-2 bg-gray-800 text-white rounded mb-4 max-w-4xl"
                  value={selectedLabId}
                  onChange={handleSelectChange}
                >
                  <option value="" disabled>
                    Select one of your labs
                  </option>
                  {ownedLabs.filter(lab => !isNaN(lab.id))
                    .map((lab) => (
                      <option key={lab.id} value={lab.id}>
                        {lab.name}
                      </option>
                    ))
                  }
                </select>
              </div>
              {selectedLab && (
                <ProviderLabItem
                  lab={selectedLab}
                  onEdit={() => setIsModalOpen(true)}
                  onCollect={handleCollect}
                  onDelete={handleDeleteLab}
                  onList={handleList}
                  onUnlist={handleUnlist}
                />
              )}
              </>
            ) : (
              <p className="text-gray-300 text-center">
                You have no labs registered yet. Press &quot;Add New Lab&quot; to get started.
              </p>
            )}
            <div className="flex justify-center mt-4">
            <button onClick={() => { setNewLab(newLabStructure); setIsModalOpen(true); setSelectedLabId(""); }}
              className="px-6 py-3 rounded shadow-lg bg-[#7b976e] text-white hover:bg-[#83a875]">
              Add New Lab
            </button>
            </div>
          </div>

          <div className="w-full min-[1080px]:w-1/3 mt-8 min-[1080px]:mt-0">
            <h2 className="text-xl font-semibold mb-4 text-center">Upcoming Lab Reservations</h2>
            <div className="flex justify-center">
                <CalendarWithBookings
                  selectedDate={date}
                  onDateChange={(newDate) => setDate(newDate)}
                  bookingInfo={bookingInfo}
                  minDate={today}
                  filterDate={() => false}
                  displayMode="provider-dashboard"
                />
            </div>
          </div>
          
        </div>

        <LabModal isOpen={shouldShowModal} onClose={() => setIsModalOpen(false)} onSubmit={handleSaveLab}
          lab={modalLab} maxId={maxId} key={modalLab?.id || 'new'} />
      </div>
    </AccessControl>
  );
}
