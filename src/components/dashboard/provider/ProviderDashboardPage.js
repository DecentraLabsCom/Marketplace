import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { parseUnits } from 'viem'
import { Container } from '@/components/ui'
import { useUser } from '@/context/UserContext'
import { useNotifications } from '@/context/NotificationContext'
import { 
  useAddLab, 
  useUpdateLab, 
  useDeleteLab,
  useListLab,
  useUnlistLab,
  useLabsForProvider
} from '@/hooks/lab/useLabs'
import { useLabBookingsDashboard } from '@/hooks/booking/useBookings'
import { useRequestFunds } from '@/hooks/booking/useBookings'
import { useSaveLabData, useDeleteLabData } from '@/hooks/provider/useProvider'
import { useLabToken } from '@/context/LabTokenContext'
import LabModal from '@/components/dashboard/provider/LabModal'
import AccessControl from '@/components/auth/AccessControl'
import DashboardHeader from '@/components/dashboard/user/DashboardHeader'
import ProviderLabsList from '@/components/dashboard/provider/ProviderLabsList'
import ReservationsCalendar from '@/components/dashboard/provider/ReservationsCalendar'
import ProviderActions from '@/components/dashboard/provider/ProviderActions'
import devLog from '@/utils/dev/logger'

export default function ProviderDashboard() {
  const { address, user, isSSO, isProvider, isProviderLoading, isLoading } = useUser();  
  const router = useRouter();
  
  // 🚀 React Query for labs owned by this provider - with safe defaults
  const allLabsResult = useLabsForProvider(address, { 
    enabled: !!address && !isLoading && !isProviderLoading
  });
  
  // Safe destructuring with guaranteed defaults to prevent Rules of Hooks violations
  const allLabsData = allLabsResult?.data || null;
  const loading = allLabsResult?.isLoading || false;
  const labsError = allLabsResult?.isError || false;
  const labsErrorDetails = allLabsResult?.error || null;
  
  const labs = Array.isArray(allLabsData?.labs) ? allLabsData.labs : [];
  
  // Extract owned labs - already filtered by useLabsForProvider
  const ownedLabs = useMemo(() => {
    if (!allLabsData || !Array.isArray(allLabsData.labs)) {
      return [];
    }
    return allLabsData.labs;
  }, [allLabsData]);

  // Legacy compatibility - derive ownedLabIds from owned labs
  const ownedLabIds = useMemo(() => 
    ownedLabs.map(lab => lab.id || lab.tokenId).filter(Boolean), 
    [ownedLabs]
  );

  const { addTemporaryNotification, addPersistentNotification } = useNotifications();
  const { decimals } = useLabToken();

  // 🚀 React Query mutations for lab management
  const addLabMutation = useAddLab();
  const updateLabMutation = useUpdateLab();
  const deleteLabMutation = useDeleteLab();
  const listLabMutation = useListLab();
  const unlistLabMutation = useUnlistLab();
  
  // 🚀 React Query mutations for requesting funds (claiming $LAB tokens)
  const requestFundsMutation = useRequestFunds();
  
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
  } = useLabBookingsDashboard(selectedLabId, {
    queryOptions: {
      enabled: !!selectedLabId
    }
  });
  const labBookings = labBookingsData?.bookings || [];

  const newLabStructure = {
    name: '', category: '', keywords: [], price: '', description: '',
    provider: '', auth: '', accessURI: '', accessKey: '', timeSlots: [],
    opens: '', closes: '', docs: [], images: [], uri: ''
  };
  const [newLab, setNewLab] = useState(newLabStructure);
  
  const maxId = useMemo(() => 
    Array.isArray(ownedLabs) && ownedLabs.length > 0 
      ? Math.max(...ownedLabs.map(lab => parseInt(lab.id) || 0).filter(id => !isNaN(id))) 
      : 0,
    [ownedLabs]
  );

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

  // Handle adding a new lab using React Query mutation
  const handleAddLab = useCallback(async ({ labData }) => {
    const maxId = Array.isArray(ownedLabs) && ownedLabs.length > 0 
      ? Math.max(...ownedLabs.map(lab => parseInt(lab.id) || 0).filter(id => !isNaN(id))) 
      : 0;
    labData.uri = labData.uri || `Lab-${user?.name || 'Provider'}-${maxId + 1}.json`;

    try {
      addTemporaryNotification('pending', '⏳ Adding lab...');
      
      // 🚀 Use React Query mutation for lab creation
      await addLabMutation.mutateAsync({
        ...labData,
        providerId: address, // Add provider info
        isSSO,
        userEmail: user.email
      });
      
      addTemporaryNotification('success', '✅ Lab added!');
      setTimeout(() => setIsModalOpen(false), 0);
      
    } catch (error) {
      devLog.error('Error adding lab:', error);
      addTemporaryNotification('error', `❌ Failed to add lab: ${error.message}`);
    }
  }, [
    ownedLabs, user?.name, addLabMutation, address, isSSO, user?.email, addTemporaryNotification
  ]);

  // Redirect non-providers to home page
  useEffect(() => {
    // Only redirect after loading is complete to avoid false redirects
    if (!isLoading && !isProviderLoading && address && !isProvider) {
      router.push('/');
      return;
    }
  }, [isProvider, isProviderLoading, isLoading, address, router]);

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
    const originalLab = ownedLabs.find(lab => lab.id == labData.id);

    const wasLocalJson = originalLab.uri && originalLab.uri.startsWith('Lab-');
    const isNowExternal = labData.uri && (labData.uri.startsWith('http://') || 
                          labData.uri.startsWith('https://'));
    const mustDeleteOldJson = wasLocalJson && isNowExternal;

    // Helper function to normalize values for comparison (treat undefined/null as empty string)
    const normalize = (value) => value === undefined || value === null ? '' : value;
    
    // ONLY compare on-chain fields that are stored in the smart contract
    // According to smart contract ABI: uri, price, auth, accessURI, accessKey
    const hasChangedOnChainData =
      normalize(originalLab.uri) !== normalize(labData.uri) ||
      normalize(originalLab.price) !== normalize(labData.price) ||
      normalize(originalLab.auth) !== normalize(labData.auth) ||
      normalize(originalLab.accessURI) !== normalize(labData.accessURI) ||
      normalize(originalLab.accessKey) !== normalize(labData.accessKey);

    // Debug logging to help identify what's causing transaction triggers
    devLog.log('🔍 On-chain comparison debug:', {
      uri: { original: normalize(originalLab.uri), new: normalize(labData.uri), changed: normalize(originalLab.uri) !== normalize(labData.uri) },
      price: { original: normalize(originalLab.price), new: normalize(labData.price), changed: normalize(originalLab.price) !== normalize(labData.price) },
      auth: { original: normalize(originalLab.auth), new: normalize(labData.auth), changed: normalize(originalLab.auth) !== normalize(labData.auth) },
      accessURI: { original: normalize(originalLab.accessURI), new: normalize(labData.accessURI), changed: normalize(originalLab.accessURI) !== normalize(labData.accessURI) },
      accessKey: { original: normalize(originalLab.accessKey), new: normalize(labData.accessKey), changed: normalize(originalLab.accessKey) !== normalize(labData.accessKey) },
      hasChangedOnChainData
    });

    try {
      if (hasChangedOnChainData) {
        // 1a. If there are on-chain changes, update blockchain via mutation
        addTemporaryNotification('pending', '⏳ Updating lab onchain...');
        devLog.log('ProviderDashboard: Executing blockchain update for on-chain changes');

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
        // 1b. No on-chain changes - only update off-chain data (JSON file)
        devLog.log('ProviderDashboard: No on-chain changes detected, updating only off-chain data');
        
        // Save the JSON if necessary (for off-chain data only)
        if (labData.uri.startsWith('Lab-')) {
          try {
            await saveLabDataMutation.mutateAsync({
              ...labData,
              price: originalPrice // Save with human-readable price for JSON consistency
            });
            
            // Add a small delay to ensure cache propagation in production
            await new Promise(resolve => setTimeout(resolve, 150));
            
            addTemporaryNotification('success', '✅ Lab metadata updated!');
          } catch (error) {
            addTemporaryNotification('error', `❌ Failed to save lab data: ${formatErrorMessage(error)}`);
            return;
          }
        } else {
          // No JSON to save and no on-chain changes - just show success
          addTemporaryNotification('success', '✅ No changes to save!');
        }
      }
      
      // 2. Save the JSON if there were on-chain changes (to keep metadata in sync)
      if (hasChangedOnChainData && labData.uri.startsWith('Lab-')) {
        try {
          await saveLabDataMutation.mutateAsync({
            ...labData,
            price: originalPrice // Save with human-readable price for JSON consistency
          });
          
          // Add a small delay to ensure cache propagation in production
          await new Promise(resolve => setTimeout(resolve, 150));
          
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
    }
  }

  // Handle delete a lab using React Query mutation
  const handleDeleteLab = async (labId) => {
    try {
      addTemporaryNotification('pending', '⏳ Deleting lab...');

      // 🚀 Use React Query mutation for lab deletion
      await deleteLabMutation.mutateAsync(labId);
      
      addTemporaryNotification('success', '✅ Lab deleted!');

      // React Query mutations and event contexts will handle cache cleanup automatically
      devLog.log('🗑️ Lab deleted, cache cleanup will be handled automatically by event contexts');
      
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
      // 🚀 Use React Query mutation for lab listing
      await listLabMutation.mutateAsync(labId);
      
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

      // 🚀 Use React Query mutation for lab unlisting
      await unlistLabMutation.mutateAsync(labId);
      
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
      
      await requestFundsMutation.mutateAsync();
      
      addTemporaryNotification('success', '✅ Balance collected!');
    } catch (err) {
      devLog.error(err);
      addTemporaryNotification('error', `❌ Failed to collect balances: ${formatErrorMessage(err)}`);
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

  // Handle wallet disconnection (redirect will handle it)
  if (!isLoading && !isProviderLoading && !address) {
    return (
      <AccessControl requireWallet message="Please log in to manage your labs.">
        <Container padding="sm" className="text-center">
          <div className="flex items-center justify-center space-x-2">
            <div className="animate-spin rounded-full size-6 border-b-2 border-blue-600"></div>
            <span>Redirecting to home...</span>
          </div>
        </Container>
      </AccessControl>
    );
  }

  // Show loading state while determining provider status
  if (isLoading || isProviderLoading) {
    return (
      <AccessControl requireWallet message="Please log in to manage your labs.">
        <Container padding="sm" className="text-center">
          <div className="flex items-center justify-center space-x-2">
            <div className="animate-spin rounded-full size-6 border-b-2 border-blue-600"></div>
            <span>Loading provider data...</span>
          </div>
        </Container>
      </AccessControl>
    );
  }

  // Don't render anything if user is not a provider (redirect will handle it)
  if (!isProvider) {
    return (
      <AccessControl requireWallet message="Please log in to manage your labs.">
        <Container padding="sm" className="text-center">
          <p>Redirecting to home page...</p>
        </Container>
      </AccessControl>
    );
  }

  // ❌ Error handling for React Query
  if (labsError) {
    return (
      <AccessControl requireWallet message="Please log in to manage your labs.">
        <Container padding="sm">
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
        </Container>
      </AccessControl>
    );
  }

  return (
    <AccessControl requireWallet message="Please log in to manage your labs.">
      <Container padding="sm">
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
      </Container>
    </AccessControl>
  );
}