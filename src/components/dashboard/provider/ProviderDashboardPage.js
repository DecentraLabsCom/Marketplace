import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { parseUnits } from 'viem'
import { Container } from '@/components/ui'
import { useUser } from '@/context/UserContext'
import { useNotifications } from '@/context/NotificationContext'
import { useOptimisticUI } from '@/context/OptimisticUIContext'
import { labQueryKeys } from '@/utils/hooks/queryKeys'
import { globalQueryClient } from '@/context/ClientQueryProvider'
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
import { useSaveLabData, useDeleteLabData, useMoveFiles } from '@/hooks/provider/useProvider'
import { useLabToken } from '@/context/LabTokenContext'
import useProviderLabsManager, { DEFAULT_NEW_LAB } from '@/hooks/provider/useProviderLabsManager'
import LabModal from '@/components/dashboard/provider/LabModal'
import AccessControl from '@/components/auth/AccessControl'
import DashboardHeader from '@/components/dashboard/user/DashboardHeader'
import ProviderLabsList from '@/components/dashboard/provider/ProviderLabsList'
import ReservationsCalendar from '@/components/dashboard/provider/ReservationsCalendar'
import ProviderActions from '@/components/dashboard/provider/ProviderActions'
import ProviderStakingPanel from '@/components/dashboard/provider/staking/ProviderStakingPanel'
import PendingPayoutsPanel from '@/components/dashboard/provider/staking/PendingPayoutsPanel'
import ProviderStakingCompactCard from '@/components/dashboard/provider/staking/ProviderStakingCompactCard'
import ProviderStakingModal from '@/components/dashboard/provider/staking/ProviderStakingModal'
import StakeHealthIndicator from '@/components/dashboard/provider/staking/StakeHealthIndicator'
import { useStakeInfo } from '@/hooks/staking/useStakingAtomicQueries'
import { mapBookingsForCalendar } from '@/utils/booking/calendarBooking'
import getBaseUrl from '@/utils/env/baseUrl'
import devLog from '@/utils/dev/logger'
import {
  notifyLabCollected,
  notifyLabCollectFailed,
  notifyLabCollectStarted,
  notifyLabCreateCancelled,
  notifyLabCreated,
  notifyLabCreatedFilesWarning,
  notifyLabCreatedMetadataWarning,
  notifyLabCreateFailed,
  notifyLabDeleted,
  notifyLabDeletedCascadeWarning,
  notifyLabDeleteFailed,
  notifyLabDeleteStarted,
  notifyLabInvalidPrice,
  notifyLabListed,
  notifyLabListingRequested,
  notifyLabListFailed,
  notifyLabMetadataSaveFailed,
  notifyLabMetadataUpdated,
  notifyLabNoChanges,
  notifyLabUnlisted,
  notifyLabUnlistFailed,
  notifyLabUpdated,
  notifyLabUpdateFailed,
  notifyLabUpdateStarted,
} from '@/utils/notifications/labToasts'

import { sanitizeProviderNameForUri, resolveOnchainLabUri } from '@/utils/metadata/helpers'

/**
 * Provider dashboard page component
 * Displays provider's labs, reservations calendar, and provides lab management tools
 * @returns {JSX.Element} Complete provider dashboard with access control, lab list, calendar, and management actions
 */
export default function ProviderDashboard() {
  const {
    address,
    user,
    isSSO,
    isProvider,
    isProviderLoading,
    isLoading,
    hasWalletSession,
    institutionBackendUrl,
    institutionRegistrationWallet
  } = useUser();
  const router = useRouter();

  const providerOwnerAddress = useMemo(
    () => (isSSO ? institutionRegistrationWallet : address),
    [isSSO, institutionRegistrationWallet, address]
  );

  // 🚀 React Query for labs owned by this provider - with safe defaults
  const allLabsResult = useLabsForProvider(providerOwnerAddress, { 
    enabled: !!providerOwnerAddress && !isLoading && !isProviderLoading
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

  const { addTemporaryNotification, addNotification, removeNotification } = useNotifications();
  const { setOptimisticListingState, completeOptimisticListingState, clearOptimisticListingState, setOptimisticLabState, clearOptimisticLabState } = useOptimisticUI();
  const { decimals } = useLabToken();

  // 🚀 React Query mutations for lab management
  const queryClient = globalQueryClient || null;

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
  const moveFilesMutation = useMoveFiles();
  
  // Local lab manager hook (extracted for readability & testability)
  const {
    selectedLabId,
    setSelectedLabId,
    selectedLab,
    maxId,
    isModalOpen,
    setIsModalOpen,
    isCreatingLab,
    newLab,
    setNewLab,
    modalLab,
    shouldShowModal,
    labForModal,
    handleSaveLab,
    handleDeleteLab,
    handleList,
    handleUnlist,
    handleCollectAll,
    handleSelectChange,
    handleCloseModal,
    formatErrorMessage,
  } = useProviderLabsManager({ ownedLabs, providerOwnerAddress, isSSO, user, address, institutionBackendUrl, decimals });

  const [isStakingModalOpen, setIsStakingModalOpen] = useState(false);

  // Staking summary (used in compact card)
  const { data: stakeInfo } = useStakeInfo(providerOwnerAddress, { enabled: !!providerOwnerAddress && !isSSO });

  // React Query for lab bookings with user details (uses selectedLab from hook)
  const canFetchLabBookings = Boolean(selectedLab?.id && (isSSO || hasWalletSession));
  const { data: labBookingsData, isError: bookingsError } = useLabBookingsDashboard(selectedLab?.id, { queryOptions: { enabled: canFetchLabBookings } });
  const labBookings = labBookingsData?.bookings || [];

  const bookingInfo = useMemo(() => {
    if (!selectedLab || !labBookings || bookingsError) return [];
    return mapBookingsForCalendar(labBookings, { labName: selectedLab.name });
  }, [selectedLab, labBookings, bookingsError]);

  // Calendar
  const today = new Date();
  const [date, setDate] = useState(new Date());

  // Redirect non-providers to home page for wallet users
  useEffect(() => {
    // Only redirect after loading is complete to avoid false redirects
    if (!isLoading && !isProviderLoading && address && !isProvider && !isSSO) {
      router.push('/');
      return;
    }
  }, [isProvider, isProviderLoading, isLoading, address, isSSO, router]);

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
        notifyLabInvalidPrice(addTemporaryNotification);
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
    const originalLab = ownedLabs.find(lab => lab.id == labData.id);
    
    // Use original lab's URI to preserve consistency, regardless of provider name changes
    // Only generate new URI if both labData.uri and originalLab.uri are missing (shouldn't happen)
    const providerSegmentSource = isSSO
      ? (user?.institutionName || user?.name)
      : user?.name;
    const providerSegment = sanitizeProviderNameForUri(providerSegmentSource);
    labData.uri = labData.uri || originalLab?.uri || `Lab-${providerSegment}-${labData.id}.json`;
    const onchainUri = resolveOnchainLabUri(labData.uri);

    const wasLocalJson = originalLab.uri && originalLab.uri.startsWith('Lab-');
    const isNowExternal = labData.uri && (labData.uri.startsWith('http://') || 
                          labData.uri.startsWith('https://'));
    const mustDeleteOldJson = wasLocalJson && isNowExternal;

    // Helper function to normalize values for comparison (treat undefined/null as empty string)
    const normalize = (value) => value === undefined || value === null ? '' : value;
    
    // ONLY compare on-chain fields that are stored in the smart contract
    // According to smart contract ABI: uri, price, accessURI, accessKey (auth removed - now per provider)
    const hasChangedOnChainData =
      normalize(originalLab.uri) !== normalize(onchainUri) ||
      normalize(originalLab.price) !== normalize(labData.price) ||
      normalize(originalLab.accessURI) !== normalize(labData.accessURI) ||
      normalize(originalLab.accessKey) !== normalize(labData.accessKey);

    // Debug logging to help identify what's causing transaction triggers
    devLog.log('🔍 On-chain comparison debug:', {
      uri: { original: normalize(originalLab.uri), new: normalize(onchainUri), changed: normalize(originalLab.uri) !== normalize(onchainUri) },
      price: { original: normalize(originalLab.price), new: normalize(labData.price), changed: normalize(originalLab.price) !== normalize(labData.price) },
      accessURI: { original: normalize(originalLab.accessURI), new: normalize(labData.accessURI), changed: normalize(originalLab.accessURI) !== normalize(labData.accessURI) },
      accessKey: { original: normalize(originalLab.accessKey), new: normalize(labData.accessKey), changed: normalize(originalLab.accessKey) !== normalize(labData.accessKey) },
      hasChangedOnChainData
    });

    try {
      if (hasChangedOnChainData) {
        // 1a. If there are on-chain changes, update blockchain via mutation
        const actionKey = `update:${labData.id}`;
        if (isSSO) {
          setActionProgressNotification(actionKey, 'Updating lab onchain...');
        } else {
          notifyLabUpdateStarted(addTemporaryNotification, labData.id);
        }
        setOptimisticLabState(String(labData.id), { editing: true, isPending: true });
        devLog.log('ProviderDashboard: Executing blockchain update for on-chain changes');

        // Use React Query mutation - it will route to correct service based on isSSO
        try {
          await updateLabMutation.mutateAsync({
            labId: labData.id,
            labData: {
              uri: onchainUri,
              price: labData.price, // Already in token units
              accessURI: labData.accessURI,
              accessKey: labData.accessKey
            },
            backendUrl: isSSO ? institutionBackendUrl : undefined
          });

          if (isSSO) {
            clearActionProgressNotification(actionKey);
          }
          notifyLabUpdated(addTemporaryNotification, labData.id);
          // Clear optimistic editing marker
          clearOptimisticLabState(String(labData.id));
        } catch (err) {
          devLog.error('Error updating lab onchain:', err);
          if (isSSO) {
            clearActionProgressNotification(actionKey);
          }
          clearOptimisticLabState(String(labData.id));
          try {
            queryClient?.invalidateQueries({ queryKey: labQueryKeys.isTokenListed(labData.id), exact: true });
            queryClient?.invalidateQueries({ queryKey: labQueryKeys.getAllLabs(), exact: true });
          } catch (cacheErr) {
            devLog.warn('Failed to invalidate cache after update error:', cacheErr);
          }
          notifyLabUpdateFailed(addTemporaryNotification, labData.id, formatErrorMessage(err));
          return;
        }
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
            
            notifyLabMetadataUpdated(addTemporaryNotification, labData.id);
          } catch (error) {
            notifyLabMetadataSaveFailed(addTemporaryNotification, labData.id, formatErrorMessage(error));
            return;
          }
        } else {
          // No JSON to save and no on-chain changes - just show success
          notifyLabNoChanges(addTemporaryNotification, labData.id);
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
          notifyLabMetadataSaveFailed(addTemporaryNotification, labData.id, formatErrorMessage(error));
          return;
        }
      }

      // 3. Delete the old JSON if necessary
      if (mustDeleteOldJson) {
        await deleteLabDataMutation.mutateAsync(originalLab.uri);
      }
    } catch (error) {
      devLog.error('Error updating lab:', error);
      notifyLabUpdateFailed(addTemporaryNotification, labData.id, formatErrorMessage(error));
    }
  }

  // Handle delete a lab using React Query mutation
  const handleDeleteLab = async (labId) => {
    const actionKey = `delete:${labId}`;
    try {
      // Optimistic UI: mark deleting and provide immediate feedback
      if (isSSO) {
        setActionProgressNotification(actionKey, 'Deleting lab...');
      } else {
        notifyLabDeleteStarted(addTemporaryNotification, labId);
      }
      setOptimisticLabState(String(labId), { deleting: true, isPending: true });

      // 🚀 Use React Query mutation for lab deletion
      const deletePayload = isSSO
        ? { labId, backendUrl: institutionBackendUrl }
        : labId;
      await deleteLabMutation.mutateAsync(deletePayload);
      
      // Remove from cached list immediately when possible
      try {
        queryClient.setQueryData(labQueryKeys.getAllLabs(), (old = []) => (
          Array.isArray(old) ? old.filter(l => (l?.id || l?.labId) !== String(labId)) : old
        ));
      } catch (cacheErr) {
        devLog.warn('Failed to remove deleted lab from cache immediately:', cacheErr);
      }

      if (isSSO) {
        clearActionProgressNotification(actionKey);
      }
      notifyLabDeleted(addTemporaryNotification, labId);

      // React Query mutations and event contexts will further ensure cache consistency
      devLog.log('🗑️ Lab deleted, cache cleanup will be handled automatically by event contexts');
      
      notifyLabDeletedCascadeWarning(addTemporaryNotification, labId);

      // Clear optimistic deleting state
      clearOptimisticLabState(String(labId));
    } catch (error) {
      devLog.error('Error deleting lab:', error);
      if (isSSO) {
        clearActionProgressNotification(actionKey);
      }
      clearOptimisticLabState(labId);
      try {
        queryClient?.invalidateQueries({ queryKey: labQueryKeys.isTokenListed(labId), exact: true });
        queryClient?.invalidateQueries({ queryKey: labQueryKeys.getAllLabs(), exact: true });
      } catch (cacheErr) {
        devLog.warn('Failed to invalidate cache after delete error:', cacheErr);
      }
      notifyLabDeleteFailed(addTemporaryNotification, labId, error?.message || 'Unknown error');
    }
  };

  // Handle listing a lab using React Query mutation
  const handleList = async (labId) => {
    const actionKey = `list:${labId}`;
    try {
      // Immediate user feedback: notify and set optimistic pending state
      if (isSSO) {
        setListingProgressNotification(actionKey, 'Listing lab...');
      } else {
        notifyLabListingRequested(addTemporaryNotification, labId);
      }
      setOptimisticListingState(String(labId), true, true);

      // ?Ys? Use React Query mutation for lab listing
      const listPayload = isSSO
        ? { labId, backendUrl: institutionBackendUrl }
        : labId;
      await listLabMutation.mutateAsync(listPayload);
      
      // Mark optimistic as completed (still keep new state)
      if (isSSO) {
        clearListingProgressNotification(actionKey);
      }
      completeOptimisticListingState(String(labId));

      // Immediately update cache so UI reflects onchain change without waiting for events
      updateListingCache(labId, true);

      notifyLabListed(addTemporaryNotification, labId);
    } catch (error) {
      devLog.error('Error listing lab:', error);
      if (isSSO) {
        clearListingProgressNotification(actionKey);
      }
      // Clear optimistic pending state on error
      clearOptimisticListingState(String(labId));
      try {
        queryClient?.invalidateQueries({ queryKey: labQueryKeys.isTokenListed(labId), exact: true });
        queryClient?.invalidateQueries({ queryKey: labQueryKeys.getAllLabs(), exact: true });
      } catch (cacheErr) {
        devLog.warn('Failed to invalidate cache after list error:', cacheErr);
      }
      notifyLabListFailed(addTemporaryNotification, labId, error?.message || 'Unknown error');
    }
  };
  
  // Handle unlisting a lab using React Query mutation
  const handleUnlist = async (labId) => {
    try {
      // Immediate user feedback: notify and set optimistic pending state
      setListingProgressNotification(labId, 'Unlisting lab...');
      setOptimisticListingState(String(labId), false, true);

      // ?Ys? Use React Query mutation for lab unlisting
      const unlistPayload = isSSO
        ? { labId, backendUrl: institutionBackendUrl }
        : labId;
      await unlistLabMutation.mutateAsync(unlistPayload);
      
      // Mark optimistic as completed (keep new state)
      clearListingProgressNotification(labId);
      completeOptimisticListingState(String(labId));

      // Immediately update cache so UI reflects onchain change without waiting for events
      updateListingCache(labId, false);

      notifyLabUnlisted(addTemporaryNotification, labId);
    } catch (error) {
      devLog.error('Error unlisting lab:', error);
      clearListingProgressNotification(labId);
      // Clear optimistic pending state on error
      clearOptimisticListingState(String(labId));
      try {
        queryClient?.invalidateQueries({ queryKey: labQueryKeys.isTokenListed(labId), exact: true });
        queryClient?.invalidateQueries({ queryKey: labQueryKeys.getAllLabs(), exact: true });
      } catch (cacheErr) {
        devLog.warn('Failed to invalidate cache after unlist error:', cacheErr);
      }
      notifyLabUnlistFailed(addTemporaryNotification, labId, error?.message || 'Unknown error');
    }
  };

// Handle collecting balances from all labs
  const handleCollectAll = async () => {
    const actionKey = 'collect:all';
    try {
      if (isSSO) {
        setActionProgressNotification(actionKey, 'Collecting all balances...');
      } else {
        notifyLabCollectStarted(addTemporaryNotification);
      }
      
      await requestFundsMutation.mutateAsync();
      
      if (isSSO) {
        clearActionProgressNotification(actionKey);
      }
      notifyLabCollected(addTemporaryNotification);
    } catch (err) {
      devLog.error(err);
      if (isSSO) {
        clearActionProgressNotification(actionKey);
      }
      notifyLabCollectFailed(addTemporaryNotification, formatErrorMessage(err));
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
      <AccessControl requireProvider message="Please log in to manage your labs.">
        <Container className="mt-12" padding="sm">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md mx-auto">
            <h2 className="text-red-800 text-xl font-semibold mb-2">Error Loading Labs</h2>
            <p className="text-red-500 mb-4">
              {labsErrorDetails?.message || 'Failed to load laboratory data'}
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-red-700 text-white px-4 py-2 rounded hover:bg-red-800 transition-colors"
            >
              Retry
            </button>
          </div>
        </Container>
      </AccessControl>
    );
  }

  return (
    <AccessControl requireProvider message="Please log in to manage your labs.">{" "}
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
            />

            {/* Provider actions */}
            <ProviderActions
              isSSO={isSSO}
              onCollectAll={handleCollectAll}
              onAddNewLab={() => {
                setNewLab(DEFAULT_NEW_LAB);
                setSelectedLabId("");
                setIsModalOpen(true);
              }}
            />
          </div>
        </div>

        {/* Staking & Economics — compact + modal (wallet users only) */}
        {!isSSO && (
          <>
            <ProviderStakingCompactCard
              stakeInfo={stakeInfo}
              onManage={() => setIsStakingModalOpen(true)}
            />

            <ProviderStakingModal
              isOpen={isStakingModalOpen}
              onClose={() => setIsStakingModalOpen(false)}
              providerAddress={providerOwnerAddress}
              labs={ownedLabs}
              isSSO={isSSO}
              labCount={ownedLabs.length}
              onNotify={(type, message) => addNotification(type, message)}
              onCollectAll={handleCollectAll}
              isCollecting={requestFundsMutation.isPending}
            />
          </>
        )}

        <LabModal isOpen={shouldShowModal} onClose={handleCloseModal} onSubmit={handleSaveLab}
          lab={labForModal} maxId={maxId} key={labForModal?.id || 'new'} />
      </Container>
    </AccessControl>
  );
}
