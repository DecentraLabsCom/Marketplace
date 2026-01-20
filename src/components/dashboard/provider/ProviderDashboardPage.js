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
import LabModal from '@/components/dashboard/provider/LabModal'
import AccessControl from '@/components/auth/AccessControl'
import DashboardHeader from '@/components/dashboard/user/DashboardHeader'
import ProviderLabsList from '@/components/dashboard/provider/ProviderLabsList'
import ReservationsCalendar from '@/components/dashboard/provider/ReservationsCalendar'
import ProviderActions from '@/components/dashboard/provider/ProviderActions'
import devLog from '@/utils/dev/logger'

const sanitizeProviderNameForUri = (name) => {
  const base = (name || 'Provider').toString().trim()
  const sanitized = base
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return sanitized || 'Provider'
}

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
  
  // State declarations
  const [selectedLabId, setSelectedLabId] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreatingLab, setIsCreatingLab] = useState(false);
  const hasInitialized = useRef(false);
  const createLabAbortControllerRef = useRef(null);
  const createLabNotificationIdRef = useRef(null);
  const listingNotificationIdsRef = useRef(new Map());
  const actionNotificationIdsRef = useRef(new Map());

  const setCreateLabProgress = useCallback((message, { hash } = {}) => {
    try {
      if (createLabNotificationIdRef.current) {
        removeNotification(createLabNotificationIdRef.current);
      }

      const notif = addNotification('pending', message, {
        autoHide: false,
        category: 'lab-create',
        priority: 'high',
        hash: hash || null,
        allowDuplicates: true,
      });

      createLabNotificationIdRef.current = notif?.id || null;
    } catch (err) {
      devLog.error('Failed to set create-lab progress notification:', err);
    }
  }, [addNotification, removeNotification]);

  const clearCreateLabProgress = useCallback(() => {
    try {
      if (createLabNotificationIdRef.current) {
        removeNotification(createLabNotificationIdRef.current);
        createLabNotificationIdRef.current = null;
      }
    } catch (err) {
      devLog.error('Failed to clear create-lab progress notification:', err);
    }
  }, [removeNotification]);

  const setListingProgressNotification = useCallback((labId, message) => {
    try {
      const key = String(labId);
      const existingId = listingNotificationIdsRef.current.get(key);
      if (existingId) {
        removeNotification(existingId);
      }

      const notif = addNotification('pending', message, {
        autoHide: false,
        category: 'lab-listing',
        priority: 'high',
        allowDuplicates: true,
      });

      if (notif?.id) {
        listingNotificationIdsRef.current.set(key, notif.id);
      }
    } catch (err) {
      devLog.error('Failed to set listing progress notification:', err);
    }
  }, [addNotification, removeNotification]);

  const clearListingProgressNotification = useCallback((labId) => {
    try {
      const key = String(labId);
      const existingId = listingNotificationIdsRef.current.get(key);
      if (existingId) {
        removeNotification(existingId);
        listingNotificationIdsRef.current.delete(key);
      }
    } catch (err) {
      devLog.error('Failed to clear listing progress notification:', err);
    }
  }, [removeNotification]);

  const setActionProgressNotification = useCallback((actionKey, message) => {
    try {
      const key = String(actionKey);
      const existingId = actionNotificationIdsRef.current.get(key);
      if (existingId) {
        removeNotification(existingId);
      }

      const notif = addNotification('pending', message, {
        autoHide: false,
        category: 'lab-action',
        priority: 'high',
        allowDuplicates: true,
      });

      if (notif?.id) {
        actionNotificationIdsRef.current.set(key, notif.id);
      }
    } catch (err) {
      devLog.error('Failed to set action progress notification:', err);
    }
  }, [addNotification, removeNotification]);

  const clearActionProgressNotification = useCallback((actionKey) => {
    try {
      const key = String(actionKey);
      const existingId = actionNotificationIdsRef.current.get(key);
      if (existingId) {
        removeNotification(existingId);
        actionNotificationIdsRef.current.delete(key);
      }
    } catch (err) {
      devLog.error('Failed to clear action progress notification:', err);
    }
  }, [removeNotification]);

  const updateListingCache = useCallback((labId, isListed) => {
    if (!queryClient) return;

    const ids = new Set();
    if (labId !== null && labId !== undefined) {
      ids.add(labId);
      ids.add(String(labId));

      const numericId = Number(labId);
      if (!Number.isNaN(numericId)) {
        ids.add(numericId);
      }
    }

    ids.forEach((id) => {
      try {
        queryClient.setQueryData(labQueryKeys.isTokenListed(id), { isListed });
      } catch (cacheErr) {
        devLog.warn('Failed to update isTokenListed cache:', cacheErr);
      }
    });

    try {
      queryClient.setQueryData(labQueryKeys.getAllLabs(), (old = []) => {
        if (!Array.isArray(old)) return old;
        return old.map((lab) => {
          const labKey = lab?.labId ?? lab?.id;
          if (labKey === undefined || labKey === null) return lab;
          return String(labKey) === String(labId) ? { ...lab, isListed } : lab;
        });
      });
    } catch (cacheErr) {
      devLog.warn('Failed to update lab list cache:', cacheErr);
    }
  }, [queryClient]);
  
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
    name: '',
    category: '',
    keywords: [],
    price: '',
    description: '',
    provider: '',
    accessURI: '',
    accessKey: '',
    timeSlots: [],
    opens: null,
    closes: null,
    docs: [],
    images: [],
    uri: '',
    availableDays: [],
    availableHours: { start: '', end: '' },
    maxConcurrentUsers: 1,
    unavailableWindows: [],
    termsOfUse: {
      url: '',
      version: '',
      effectiveDate: null,
      sha256: ''
    }
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
  
  const shouldShowModal = Boolean(isModalOpen && modalLab);
  const labForModal = modalLab || newLab;
  
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
    const providerSegmentSource = isSSO
      ? (user?.institutionName || user?.name)
      : user?.name;
    const providerSegment = sanitizeProviderNameForUri(providerSegmentSource);
    labData.uri = labData.uri || `Lab-${providerSegment}-${maxId + 1}.json`;

    // Store the original human-readable price before blockchain conversion
    const originalPrice = labData.price;
    
    // Extract temp files if they exist
    const tempFiles = labData._tempFiles || [];
    delete labData._tempFiles; // Remove from labData to avoid sending to blockchain

    try {
      setIsCreatingLab(true);
      createLabAbortControllerRef.current = isSSO ? new AbortController() : null;
      setCreateLabProgress(isSSO ? 'Sending lab to institution for execution...' : 'Confirm the transaction in your wallet...');
      
      // 🚀 Use React Query mutation for lab creation (blockchain transaction)
      const result = await addLabMutation.mutateAsync({
        ...labData,
        providerId: providerOwnerAddress || address, // Add provider info
        isSSO,
        userEmail: user.email,
        backendUrl: isSSO ? institutionBackendUrl : undefined,
        abortSignal: createLabAbortControllerRef.current?.signal,
        // SSO: be more tolerant to backend propagation delays
        pollMaxDurationMs: 12 * 60 * 1000,
        pollInitialDelayMs: 3_000,
        pollMaxDelayMs: 20_000,
        postExecutePollMaxDurationMs: 60_000,
        postExecutePollInitialDelayMs: 2_000,
        postExecutePollMaxDelayMs: 5_000,
      });
      // Close modal and notify success
      try {
        setIsModalOpen(false);
        addTemporaryNotification('success', '✅ Lab created!');
      } catch (err) {
        devLog.warn('Failed to close modal or notify success:', err);
      } finally {
        clearCreateLabProgress();
      }      
      const blockchainLabId = result?.labId?.toString?.() || result?.id?.toString?.();
      
      if (!blockchainLabId) {
        throw new Error('Lab ID not returned from blockchain');
      }
      
      setCreateLabProgress(`✅ Lab created onchain (ID: ${blockchainLabId}). Finalizing...`, { hash: result?.hash || result?.txHash });
      
      // Move temp files to correct labId folder
      if (tempFiles.length > 0) {
        try {
          devLog.log(`📁 Moving ${tempFiles.length} temp files to lab ${blockchainLabId}...`);
          setCreateLabProgress('📁 Moving uploaded files to the lab folder...');
          const moveResult = await moveFilesMutation.mutateAsync({
            filePaths: tempFiles,
            labId: blockchainLabId
          });
          
          devLog.log('✅ Files moved successfully:', moveResult);
          
          // Update labData with new file paths
          if (moveResult.movedFiles) {
            const newImages = [];
            const newDocs = [];
            
            moveResult.movedFiles.forEach(movedFile => {
              if (movedFile.original.includes('/images/')) {
                newImages.push(movedFile.new);
              } else if (movedFile.original.includes('/docs/')) {
                newDocs.push(movedFile.new);
              }
            });
            
            if (newImages.length > 0) {
              labData.images = newImages;
            }
            if (newDocs.length > 0) {
              labData.docs = newDocs;
            }
          }
        } catch (moveError) {
          devLog.error('❌ Failed to move temp files:', moveError);
          addTemporaryNotification('warning', `⚠️ Lab created but some files failed to move: ${formatErrorMessage(moveError)}`);
          // Continue - lab was created, file move is not critical
        }
      }
      
      // Save metadata JSON file for locally-managed URIs
      if (labData.uri.startsWith('Lab-')) {
        try {
          devLog.log('📝 Saving lab metadata JSON after blockchain creation...');
          setCreateLabProgress('💾 Saving lab metadata (offchain)...');
          await saveLabDataMutation.mutateAsync({
            ...labData,
            id: blockchainLabId, // Use the blockchain labId
            price: originalPrice // Save with human-readable price for JSON consistency
          });
          
          // Add a small delay to ensure cache propagation in production
          await new Promise(resolve => setTimeout(resolve, 150));
          
          devLog.log('✅ Lab metadata JSON saved successfully');
        } catch (error) {
          devLog.error('❌ Failed to save lab metadata JSON:', error);
          addTemporaryNotification('warning', `⚠️ Lab created but metadata failed to save: ${formatErrorMessage(error)}`);
          // Don't return - lab was created successfully, just metadata save failed
        }
      }

      // Ensure UI shows the provided lab name immediately by updating the cache
      try {
        if (blockchainLabId) {
          const immediateUpdate = {
            id: blockchainLabId,
            labId: blockchainLabId,
            name: labData.name || undefined,
            description: labData.description || undefined,
            image: (labData.images && labData.images[0]) || labData.image || undefined,
            images: Array.isArray(labData.images) ? labData.images : undefined,
            price: originalPrice || undefined,
            timestamp: new Date().toISOString()
          };

          // Update specific lab query
          queryClient.setQueryData(labQueryKeys.getLab(blockchainLabId), (old) => ({ ...(old || {}), ...immediateUpdate }));

          // Update list of labs if present
          queryClient.setQueryData(labQueryKeys.getAllLabs(), (old = []) => {
            // If lab exists in the list, replace it; otherwise add it to the top
            const exists = old.some(l => l?.labId === blockchainLabId || l?.id === blockchainLabId);
            if (exists) return old.map(l => (l?.labId === blockchainLabId || l?.id === blockchainLabId) ? { ...l, ...immediateUpdate } : l);
            return [{ ...immediateUpdate }, ...old];
          });
        }
      } catch (err) {
        devLog.warn('Failed to apply immediate lab cache update:', err);
      }

      // Close modal and notify success
      try {
        setIsModalOpen(false);
        addTemporaryNotification('success', '✅ Lab created!');
      } catch (err) {
        devLog.warn('Failed to close modal or notify success:', err);
      } finally {
        clearCreateLabProgress();
      }
    } catch (error) {
      devLog.error('Error adding lab:', error);
      addTemporaryNotification('error', `❌ Failed to add lab: ${error.message}`);
      clearCreateLabProgress();
    } finally {
      setIsCreatingLab(false);
      createLabAbortControllerRef.current = null;
    }
  }, [
    ownedLabs,
    user?.name,
    addLabMutation,
    saveLabDataMutation,
    moveFilesMutation,
    address,
    isSSO,
    user?.email,
    addTemporaryNotification,
    setCreateLabProgress,
    clearCreateLabProgress,
  ]);

  const handleCloseModal = useCallback(() => {
    if (isCreatingLab && isSSO && createLabAbortControllerRef.current) {
      try {
        createLabAbortControllerRef.current.abort();
        addTemporaryNotification('warning', '⚠️ Lab creation cancelled (institution request aborted)');
      } catch (err) {
        devLog.error('Failed aborting create-lab request:', err);
      } finally {
        clearCreateLabProgress();
      }
    }

    setIsModalOpen(false);
  }, [addTemporaryNotification, clearCreateLabProgress, isCreatingLab, isSSO]);

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
    const originalLab = ownedLabs.find(lab => lab.id == labData.id);
    
    // Use original lab's URI to preserve consistency, regardless of provider name changes
    // Only generate new URI if both labData.uri and originalLab.uri are missing (shouldn't happen)
    const providerSegmentSource = isSSO
      ? (user?.institutionName || user?.name)
      : user?.name;
    const providerSegment = sanitizeProviderNameForUri(providerSegmentSource);
    labData.uri = labData.uri || originalLab?.uri || `Lab-${providerSegment}-${labData.id}.json`;

    const wasLocalJson = originalLab.uri && originalLab.uri.startsWith('Lab-');
    const isNowExternal = labData.uri && (labData.uri.startsWith('http://') || 
                          labData.uri.startsWith('https://'));
    const mustDeleteOldJson = wasLocalJson && isNowExternal;

    // Helper function to normalize values for comparison (treat undefined/null as empty string)
    const normalize = (value) => value === undefined || value === null ? '' : value;
    
    // ONLY compare on-chain fields that are stored in the smart contract
    // According to smart contract ABI: uri, price, accessURI, accessKey (auth removed - now per provider)
    const hasChangedOnChainData =
      normalize(originalLab.uri) !== normalize(labData.uri) ||
      normalize(originalLab.price) !== normalize(labData.price) ||
      normalize(originalLab.accessURI) !== normalize(labData.accessURI) ||
      normalize(originalLab.accessKey) !== normalize(labData.accessKey);

    // Debug logging to help identify what's causing transaction triggers
    devLog.log('🔍 On-chain comparison debug:', {
      uri: { original: normalize(originalLab.uri), new: normalize(labData.uri), changed: normalize(originalLab.uri) !== normalize(labData.uri) },
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
          addTemporaryNotification('pending', 'Updating lab onchain...');
        }
        setOptimisticLabState(String(labData.id), { editing: true, isPending: true });
        devLog.log('ProviderDashboard: Executing blockchain update for on-chain changes');

        // Use React Query mutation - it will route to correct service based on isSSO
        try {
          await updateLabMutation.mutateAsync({
            labId: labData.id,
            labData: {
              uri: labData.uri,
              price: labData.price, // Already in token units
              accessURI: labData.accessURI,
              accessKey: labData.accessKey
            },
            backendUrl: isSSO ? institutionBackendUrl : undefined
          });

          if (isSSO) {
            clearActionProgressNotification(actionKey);
          }
          addTemporaryNotification('success', '✅ Lab updated!');
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
          addTemporaryNotification('error', `❌ Failed to update lab: ${formatErrorMessage(err)}`);
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
    const actionKey = `delete:${labId}`;
    try {
      // Optimistic UI: mark deleting and provide immediate feedback
      if (isSSO) {
        setActionProgressNotification(actionKey, 'Deleting lab...');
      } else {
        addTemporaryNotification('pending', 'Deleting lab...');
      }
      setOptimisticLabState(String(labId), { deleting: true, isPending: true });

      // 🚀 Use React Query mutation for lab deletion
      await deleteLabMutation.mutateAsync(labId);
      
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
      addTemporaryNotification('success', '✅ Lab deleted!');

      // React Query mutations and event contexts will further ensure cache consistency
      devLog.log('🗑️ Lab deleted, cache cleanup will be handled automatically by event contexts');
      
      addTemporaryNotification('warning', 
        `⚠️ Lab deleted successfully. All associated reservations have been automatically cancelled.`
      );

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
      addTemporaryNotification('error', `❌ Failed to delete lab: ${error.message}`);
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
        addTemporaryNotification('pending', 'Sending listing request...');
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

      addTemporaryNotification('success', '✅ Lab listed successfully!');
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
      addTemporaryNotification('error', `❌ Failed to list lab: ${error.message}`);
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

      addTemporaryNotification('success', '✅ Lab unlisted!');
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
      addTemporaryNotification('error', `❌ Failed to unlist lab: ${error.message}`);
    }
  };

// Handle collecting balances from all labs
  const handleCollectAll = async () => {
    const actionKey = 'collect:all';
    try {
      if (isSSO) {
        setActionProgressNotification(actionKey, 'Collecting all balances...');
      } else {
        addTemporaryNotification('pending', 'Collecting all balances...');
      }
      
      await requestFundsMutation.mutateAsync();
      
      if (isSSO) {
        clearActionProgressNotification(actionKey);
      }
      addTemporaryNotification('success', '✅ Balance collected!');
    } catch (err) {
      devLog.error(err);
      if (isSSO) {
        clearActionProgressNotification(actionKey);
      }
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
                setNewLab(newLabStructure);
                setSelectedLabId("");
                setIsModalOpen(true);
              }}
            />
          </div>
        </div>

        <LabModal isOpen={shouldShowModal} onClose={handleCloseModal} onSubmit={handleSaveLab}
          lab={labForModal} maxId={maxId} key={labForModal?.id || 'new'} />
      </Container>
    </AccessControl>
  );
}
