import { useEffect, useState, useMemo, useRef } from 'react'
import { parseUnits } from 'viem'
import { useWaitForTransactionReceipt } from 'wagmi'
import { useUser } from '@/context/UserContext'
import { useNotifications } from '@/context/NotificationContext'
import { 
  useAddLab, 
  useUpdateLab, 
  useDeleteLab,
  useCreateLabMutation,
  useToggleLabStatusMutation,
  useClaimAllBalanceMutation,
  useClaimLabBalanceMutation
} from '@/hooks/lab/useLabs'
import { 
  useAllLabsComposed,
  extractLabsByOwner
} from '@/hooks/lab/useLabsComposed'
import { 
  useLabBookingsComposed
} from '@/hooks/booking/useBookingsComposed'
// import { 
//   useClaimAllBalanceMutation,
//   useClaimLabBalanceMutation
// } from '@/hooks/booking/useBookings'
import { 
  useSaveLabData, 
  useDeleteLabData 
} from '@/hooks/provider/useProvider'
import { useLabToken } from '@/hooks/useLabToken'
import { useLabEventCoordinator } from '@/hooks/lab/useLabEventCoordinator'
import { useReservationEventCoordinator } from '@/hooks/booking/useBookingEventCoordinator'
import LabModal from '@/components/dashboard/provider/LabModal'
import AccessControl from '@/components/auth/AccessControl'
import DashboardHeader from '@/components/dashboard/user/DashboardHeader'
import ProviderLabsList from '@/components/dashboard/provider/ProviderLabsList'
import ReservationsCalendar from '@/components/dashboard/provider/ReservationsCalendar'
import ProviderActions from '@/components/dashboard/provider/ProviderActions'
import devLog from '@/utils/dev/logger'

export default function ProviderDashboard() {
  const { address, user, isSSO } = useUser();  
  
  // 🚀 React Query for all labs with owner information
  const allLabsResult = useAllLabsComposed({ 
    includeMetadata: true, 
    includeOwners: true,
    queryOptions: {
      enabled: !!address
    }
  });
  
  const { 
    data: allLabsData,
    isLoading: loading,
    isError: labsError,
    error: labsErrorDetails 
  } = allLabsResult || {}; // Safety check for allLabsResult
  
  const labs = Array.isArray(allLabsData?.labs) ? allLabsData.labs : [];
  
  // Extract owned labs using the helper function
  const ownedLabs = useMemo(() => {
    if (!address || !Array.isArray(labs)) {
      return [];
    }
    
    try {
      // Filter labs directly instead of using extractLabsByOwner
      return labs.filter(lab => 
        lab.owner && lab.owner.toLowerCase() === address.toLowerCase()
      );
    } catch (error) {
      console.error('Error extracting owned labs:', error);
      return [];
    }
  }, [labs, address]); // Use labs directly instead of allLabsResult

  // Legacy compatibility - derive ownedLabIds from owned labs
  const ownedLabIds = useMemo(() => 
    ownedLabs.map(lab => lab.id || lab.tokenId).filter(Boolean), 
    [ownedLabs]
  );

  const { addTemporaryNotification, addPersistentNotification } = useNotifications();
  const { coordinatedLabUpdate } = useLabEventCoordinator();
  const { invalidateUserBookingsByLab } = useReservationEventCoordinator();
  const { decimals } = useLabToken();

  // 🚀 React Query mutations for lab management
  const addLabMutation = useAddLab();
  const updateLabMutation = useUpdateLab();
  const deleteLabMutation = useDeleteLab();
  const createLabMutation = useCreateLabMutation();
  const toggleLabStatusMutation = useToggleLabStatusMutation();
  
  // 🚀 React Query mutations for balance claims
  const claimAllBalanceMutation = useClaimAllBalanceMutation();
  const claimLabBalanceMutation = useClaimLabBalanceMutation();
  
  // 🚀 React Query mutations for provider data management
  const saveLabDataMutation = useSaveLabData();
  const deleteLabDataMutation = useDeleteLabData();
  
  // State declarations
  const [selectedLabId, setSelectedLabId] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const hasInitialized = useRef(false);
  
  // 🚀 React Query for lab bookings with user details
  const { 
    data: labBookingsData, 
    isError: bookingsError
  } = useLabBookingsComposed(selectedLabId, {
    includeUserDetails: true,
    queryOptions: {
      enabled: !!selectedLabId
    }
  });
  const labBookings = labBookingsData?.bookings || [];

  // Transaction state management for receipt handling
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
  
  const maxId = useMemo(() => 
    Array.isArray(labs) && labs.length > 0 
      ? Math.max(...labs.map(lab => parseInt(lab.id) || 0).filter(id => !isNaN(id))) 
      : 0,
    [labs]
  );

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

  const selectedLab = useMemo(() => 
    ownedLabs.find(lab => String(lab.id) === String(selectedLabId)),
    [ownedLabs, selectedLabId]
  );
  
  // Ensure we have a valid lab object to pass to the modal
  const modalLab = useMemo(() => 
    selectedLab ? selectedLab : (selectedLabId ? null : newLab),
    [selectedLab, selectedLabId, newLab]
  );
  
  const shouldShowModal = isModalOpen && modalLab;
  
  const bookingInfo = useMemo(() => {
    if (!selectedLab || !labBookings || bookingsError) return [];
    return labBookings.map(booking => ({
      ...booking,
      labName: selectedLab.name,
      status: booking.status
    }));
  }, [selectedLab, labBookings, bookingsError]);

  // Calendar
  const today = new Date();
  const [date, setDate] = useState(new Date());

  // Automatically set the first lab as the selected lab (only once)
  useEffect(() => {
    if (ownedLabs.length > 0 && !selectedLabId && !isModalOpen && !hasInitialized.current) {
      const firstLabId = ownedLabs[0]?.id;
      if (firstLabId) {
        setSelectedLabId(String(firstLabId));
        hasInitialized.current = true;
      }
    }
  }, [ownedLabs.length, selectedLabId, isModalOpen]);

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
      // 1. Update lab data using React Query mutation
      if (hasChangedOnChainData) {
        // 1a. If there is any change in the on-chain data, update blockchain via mutation
        addTemporaryNotification('pending', '⏳ Updating lab onchain...');

        // Use React Query mutation - it will route to correct service based on isSSO
        updateLabMutation.mutate({
          labId: labData.id,
          labData: {
            uri: labData.uri,
            price: labData.price, // Already in token units
            auth: labData.auth,
            accessURI: labData.accessURI,
            accessKey: labData.accessKey
          }
        });
      } else {
        // 1b. If there is no change in the on-chain data, just update via React Query
        // Keep price in human-readable format for consistency
        updateLabMutation.mutate({
          labId: labData.id,
          labData: { ...labData, price: originalPrice }
        });
        // DON'T close modal - let user close it manually
        addTemporaryNotification('success', '✅ Lab updated!');
        devLog.log('ProviderDashboard: Lab updated via React Query (offchain), modal remains open');
      }
      
      // 2. Save the JSON if necessary
      if (labData.uri.startsWith('Lab-')) {
        try {
          await saveLabDataMutation.mutateAsync({
            ...labData,
            price: originalPrice // Save with human-readable price for JSON consistency
          });
        } catch (error) {
          addTemporaryNotification('error', `❌ Failed to save lab data: ${formatErrorMessage(error)}`);
          return;
        }
      }

      // 3. Delete the old JSON if necessary
      if (mustDeleteOldJson) {
        await deleteLabDataMutation.mutateAsync(originalLab.uri);
      }
    } catch (error) {
      devLog.error('Error updating lab:', error);
      addTemporaryNotification('error', `❌ Failed to update lab: ${formatErrorMessage(error)}`);
      throw error; // Re-throw for coordinatedLabUpdate to handle
    }
    }); // End of coordinatedLabUpdate
  }

  // Handle adding a new lab using React Query mutation
  async function handleAddLab({ labData }) {
    const maxId = Array.isArray(labs) && labs.length > 0 
      ? Math.max(...labs.map(lab => parseInt(lab.id) || 0).filter(id => !isNaN(id))) 
      : 0;
    labData.uri = labData.uri || `Lab-${user?.name || 'Provider'}-${maxId + 1}.json`;

    try {
      addTemporaryNotification('pending', '⏳ Adding lab...');
      
      // 🚀 Use React Query mutation for lab creation
      await createLabMutation.mutateAsync({
        ...labData,
        providerId: address, // Add provider info
        isSSO,
        userEmail: user.email
      });
      
      addTemporaryNotification('success', '✅ Lab added!');
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
      
      addTemporaryNotification('success', '✅ Lab deleted!');

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
      
      addTemporaryNotification('success', '✅ Lab unlisted!');
    } catch (error) {
      devLog.error('Error unlisting lab:', error);
      addTemporaryNotification('error', `❌ Failed to unlist lab: ${error.message}`);
    }
  };

  // Handle collecting balances from all labs
  const handleCollectAll = async () => {
    try {
      addTemporaryNotification('pending', '⏳ Collecting all balances...');
      
      await claimAllBalanceMutation.mutateAsync();
      
      addTemporaryNotification('success', '✅ Balance collected!');
    } catch (err) {
      devLog.error(err);
      addTemporaryNotification('error', `❌ Failed to collect balances: ${formatErrorMessage(err)}`);
    }
  };
  
  // Handle collecting balance from a specific lab
  const handleCollect = async (labId) => {
    try {
      addTemporaryNotification('pending', '⏳ Collecting lab balance...');
      
      await claimLabBalanceMutation.mutateAsync(labId);
      
      addTemporaryNotification('success', '✅ Balance collected!');
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
        {/* Dashboard header */}
        <DashboardHeader title="Lab Panel" />

        <div className="flex flex-col min-[1080px]:flex-row min-[1080px]:gap-6">
          {/* Provider labs management */}
          <ProviderLabsList
            ownedLabs={ownedLabs}
            selectedLab={selectedLab}
            selectedLabId={selectedLabId}
            isLoading={loading}
            onSelectChange={handleSelectChange}
            onEdit={() => setIsModalOpen(true)}
            onCollect={handleCollect}
            onDelete={handleDeleteLab}
            onList={handleList}
            onUnlist={handleUnlist}
          />

          <div className="flex flex-col min-[1080px]:w-1/3 mt-6 min-[1080px]:mt-0">
            {/* Reservations calendar */}
            <ReservationsCalendar
              selectedDate={date}
              onDateChange={(newDate) => setDate(newDate)}
              bookingInfo={bookingInfo}
              minDate={today}
              filterDate={() => false}
            />

            {/* Provider actions */}
            <ProviderActions
              onCollectAll={handleCollectAll}
              onAddNewLab={() => {
                setNewLab(newLabStructure);
                setSelectedLabId("");
                setIsModalOpen(true);
              }}
            />
          </div>
        </div>

        <LabModal isOpen={shouldShowModal} onClose={() => setIsModalOpen(false)} onSubmit={handleSaveLab}
          lab={modalLab} maxId={maxId} key={modalLab?.id || 'new'} />
      </div>
    </AccessControl>
  );
}