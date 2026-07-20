import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
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
import { useSaveLabData, useDeleteLabData, useCleanupLabData, useMoveFiles, useDeleteFile } from '@/hooks/provider/useProvider'
import { useLabCredit } from '@/context/LabCreditContext'
import LabModal from '@/components/dashboard/provider/LabModal'
import AccessControl from '@/components/auth/AccessControl'
import DashboardHeader from '@/components/dashboard/user/DashboardHeader'
import ProviderLabsList from '@/components/dashboard/provider/ProviderLabsList'
import ReservationsCalendar from '@/components/dashboard/provider/ReservationsCalendar'
import ProviderActions from '@/components/dashboard/provider/ProviderActions'
import {
  buildProviderLabUri,
  createEmptyLabDraft,
  advanceLabCreationStage,
  formatErrorMessage,
  isLabIdListCache,
  LAB_CREATION_STAGES,
  remapMovedLabAssetPaths,
  resolveOnchainLabUri,
  shouldCompensateLabCreation,
  updateListingCache,
} from '@/components/dashboard/provider/providerDashboard.helpers'
import { mapBookingsForCalendar } from '@/utils/booking/calendarBooking'
import { getPucHashFromSession } from '@/utils/auth/puc'
import { normalizeResourceTypeCode } from '@/utils/resourceType'
import { displayPriceToRawPerSecond, normalizePricingUnit } from '@/utils/pricing/pricingUnits'
import devLog from '@/utils/dev/logger'
import {
  notifyLabCreateCancelled,
  notifyLabCreatorMismatch,
  notifyLabCreated,
  notifyLabCreationReconciliationRequired,
  notifyLabCreateFailed,
  notifyLabDeleted,
  notifyLabDeleteFailed,
  notifyLabStorageCleanupWarning,
  notifyLabListed,
  notifyLabListFailed,
  notifyLabMetadataSaveFailed,
  notifyLabMetadataUpdated,
  notifyLabNoChanges,
  notifyLabUnlisted,
  notifyLabUnlistFailed,
  notifyLabUpdated,
  notifyLabUpdateFailed,
} from '@/utils/notifications/labToasts'

const resolveEffectiveOnchainAccessKey = (lab, resourceTypeCode) => {
  const accessKey = lab?.accessKey
  if (accessKey !== undefined && accessKey !== null && String(accessKey).trim()) {
    return accessKey
  }
  return resourceTypeCode === 1 ? (lab?.fmuFileName || '') : accessKey
}

const extractLocalMetadataUri = (uri) => {
  const trimmed = String(uri || '').trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('Lab-') && trimmed.endsWith('.json')) return trimmed

  try {
    const parsed = new URL(trimmed, 'http://localhost')
    const uriParam = parsed.searchParams.get('uri')
    if (uriParam?.startsWith('Lab-') && uriParam.endsWith('.json')) {
      return uriParam
    }
    const match = parsed.pathname.match(/Lab-[^/]+\.json$/)
    return match ? match[0] : ''
  } catch {
    const match = trimmed.match(/Lab-[^/?#]+\.json/)
    return match ? match[0] : ''
  }
}

const normalizeMetadataUriForComparison = (uri) => {
  const localUri = extractLocalMetadataUri(uri)
  if (localUri) return `local:${localUri}`
  return String(uri || '').trim()
}

const normalizeAccessUriForComparison = (uri) => String(uri || '').trim().replace(/\/+$/, '')

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
    isProviderLoading,
    isLoading,
    institutionBackendUrl,
    institutionRegistrationWallet,
    institutionalOnboardingStatus,
    openOnboardingModal,
  } = useUser();

  const providerOwnerAddress = useMemo(
    () => institutionRegistrationWallet || address || null,
    [institutionRegistrationWallet, address]
  );

  const currentCreatorPucHash = useMemo(
    () => (isSSO ? getPucHashFromSession(user) : null),
    [isSSO, user]
  );

  // 🚀 React Query for labs owned by this provider - with safe defaults
  const allLabsResult = useLabsForProvider(providerOwnerAddress, {
    enabled: !!providerOwnerAddress && !isLoading && !isProviderLoading,
    creatorPucHash: currentCreatorPucHash,
  });
  
  // Safe destructuring with guaranteed defaults to prevent Rules of Hooks violations
  const allLabsData = allLabsResult?.data || null;
  const loading = allLabsResult?.isLoading || false;
  const labsError = allLabsResult?.isError || false;
  const labsErrorDetails = allLabsResult?.error || null;
  
  // Extract owned labs - already filtered by useLabsForProvider
  const ownedLabs = useMemo(() => {
    if (!allLabsData || !Array.isArray(allLabsData.labs)) {
      return [];
    }
    return allLabsData.labs;
  }, [allLabsData]);

  const { addTemporaryNotification, addNotification, removeNotification } = useNotifications();
  const { setOptimisticListingState, completeOptimisticListingState, clearOptimisticListingState, setOptimisticLabState, clearOptimisticLabState } = useOptimisticUI();
  const { decimals } = useLabCredit();

  // 🚀 React Query mutations for lab management
  const queryClient = globalQueryClient || null;

  const addLabMutation = useAddLab();
  const updateLabMutation = useUpdateLab();
  const deleteLabMutation = useDeleteLab();
  const listLabMutation = useListLab();
  const unlistLabMutation = useUnlistLab();
  
  // 🚀 React Query mutations for provider data management
  const saveLabDataMutation = useSaveLabData();
  const deleteLabDataMutation = useDeleteLabData();
  const cleanupLabDataMutation = useCleanupLabData();
  const moveFilesMutation = useMoveFiles();
  const deleteFileMutation = useDeleteFile();
  
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

  const isMissingWebauthnCredentialError = useCallback((error) => {
    const message = String(error?.message || '').toLowerCase();
    return (
      error?.code === 'WEBAUTHN_CREDENTIAL_NOT_REGISTERED' ||
      message.includes('webauthn_credential_not_registered')
    );
  }, []);

  const isAuthorizationCancelledError = useCallback((error) => {
    return error?.code === 'INTENT_AUTH_CANCELLED';
  }, []);

  const handleMissingWebauthnCredential = useCallback((error) => {
    if (!isSSO) return false;
    if (isMissingWebauthnCredentialError(error)) {
      if (typeof openOnboardingModal === 'function') {
        openOnboardingModal();
      }
      return true;
    }
    if (isAuthorizationCancelledError(error) && institutionalOnboardingStatus === 'advisory') {
      if (typeof openOnboardingModal === 'function') {
        openOnboardingModal();
      }
      return true;
    }
    return false;
  }, [
    institutionalOnboardingStatus,
    isAuthorizationCancelledError,
    isMissingWebauthnCredentialError,
    isSSO,
    openOnboardingModal,
  ]);

  const handleLabAuthorizationErrorToast = useCallback((error) => {
    if (!error?.code) return false;

    if (error.code === 'LAB_CREATOR_MISMATCH') {
      notifyLabCreatorMismatch(addTemporaryNotification);
      return true;
    }

    return false;
  }, [addTemporaryNotification]);

  const handleUpdateListingCache = useCallback((labId, isListed) => {
    updateListingCache(queryClient, labId, isListed);
  }, [queryClient]);
  
  // 🚀 React Query for lab bookings with user details
  const canFetchLabBookings = Boolean(selectedLabId && providerOwnerAddress);
  const { 
    data: labBookingsData, 
    isError: bookingsError
  } = useLabBookingsDashboard(selectedLabId, {
    queryOptions: {
      enabled: canFetchLabBookings
    }
  });
  const labBookings = labBookingsData?.bookings || [];

  const [newLab, setNewLab] = useState(() => createEmptyLabDraft());
  
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
    return mapBookingsForCalendar(labBookings, { labName: selectedLab.name });
  }, [selectedLab, labBookings, bookingsError]);

  // Calendar
  const today = new Date();
  const [date, setDate] = useState(new Date());
  // Handle adding a new lab using React Query mutation
  const handleAddLab = useCallback(async ({ labData }) => {
    const maxId = Array.isArray(ownedLabs) && ownedLabs.length > 0 
      ? Math.max(...ownedLabs.map(lab => parseInt(lab.id) || 0).filter(id => !isNaN(id))) 
      : 0;
    const providerSegmentSource = user?.institutionName || user?.name;
    labData.uri = buildProviderLabUri(labData.uri, providerSegmentSource, maxId + 1);
    const onchainUri = resolveOnchainLabUri(labData.uri, { labId: labData.id });

    // Store the original human-readable price before blockchain conversion
    const originalPrice = labData.price;
    
    // Extract temp files if they exist
    const tempFiles = labData._tempFiles || [];
    delete labData._tempFiles; // Remove from labData to avoid sending to blockchain
    let blockchainLabId = null;
    let creationStage = LAB_CREATION_STAGES.DRAFT;
    let movedLabFiles = [];
    let metadataSaved = false;

    const cleanupCreationArtifacts = async () => {
      let complete = true;
      const movedOriginals = new Set(movedLabFiles.map((file) => file?.original).filter(Boolean));

      for (const movedFile of movedLabFiles) {
        try {
          await deleteFileMutation.mutateAsync({ filePath: movedFile.new, deletingLab: true });
        } catch (cleanupError) {
          complete = false;
          devLog.warn('Failed to remove moved lab asset during compensation:', cleanupError);
        }
      }

      for (const filePath of tempFiles.filter((filePath) => !movedOriginals.has(filePath))) {
        try {
          await deleteFileMutation.mutateAsync({ filePath, deletingLab: false });
        } catch (cleanupError) {
          complete = false;
          devLog.warn('Failed to remove temporary lab asset during compensation:', cleanupError);
        }
      }

      return complete;
    };

    const compensateCreation = async (reason) => {
      const contentClean = await cleanupCreationArtifacts();
      let metadataClean = true;
      let chainClean = true;

      if (metadataSaved && labData.uri.startsWith('Lab-')) {
        try {
          await deleteLabDataMutation.mutateAsync(labData.uri);
        } catch (cleanupError) {
          metadataClean = false;
          devLog.warn('Failed to remove lab metadata during compensation:', cleanupError);
        }
      }

      if (blockchainLabId) {
        try {
          const deleteResult = await deleteLabMutation.mutateAsync({
            labId: blockchainLabId,
            backendUrl: institutionBackendUrl,
          });
          chainClean = deleteResult?.status === 'executed';
        } catch (cleanupError) {
          chainClean = false;
          devLog.warn('Failed to compensate on-chain lab creation:', cleanupError);
        }
      } else if (shouldCompensateLabCreation(creationStage)) {
        chainClean = false;
      }

      if (!contentClean || !metadataClean || !chainClean) {
        notifyLabCreationReconciliationRequired(
          addTemporaryNotification,
          blockchainLabId || 'unknown',
          `${reason}; compensation was not fully confirmed`
        );
        return false;
      }
      return true;
    };

    try {
      creationStage = advanceLabCreationStage(creationStage, 'contentStaged');
      setIsCreatingLab(true);
      createLabAbortControllerRef.current = new AbortController();
      setCreateLabProgress('Sending lab to institution for execution...');
      creationStage = advanceLabCreationStage(creationStage, 'onchainPending');
      
      // 🚀 Use React Query mutation for lab creation (blockchain transaction)
      const result = await addLabMutation.mutateAsync({
        ...labData,
        uri: onchainUri,
        providerId: providerOwnerAddress, // Add provider info
        isSSO,
        userEmail: user.email,
        backendUrl: institutionBackendUrl,
        abortSignal: createLabAbortControllerRef.current?.signal,
        // SSO: be more tolerant to backend propagation delays
        pollMaxDurationMs: 12 * 60 * 1000,
        pollInitialDelayMs: 3_000,
        pollMaxDelayMs: 20_000,
        postExecutePollMaxDurationMs: 60_000,
        postExecutePollInitialDelayMs: 2_000,
        postExecutePollMaxDelayMs: 5_000,
      });
      // Close modal and notify success after all post-processing
      blockchainLabId = result?.labId?.toString?.() || result?.id?.toString?.();
      
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
          if (Array.isArray(moveResult?.movedFiles)) {
            movedLabFiles = moveResult.movedFiles;
            labData = remapMovedLabAssetPaths(labData, moveResult.movedFiles);
          }
          if (Array.isArray(moveResult?.errors) && moveResult.errors.length > 0) {
            throw new Error(`${moveResult.errors.length} uploaded file(s) could not be moved to the lab folder`);
          }
        } catch (moveError) {
          devLog.error('❌ Failed to move temp files:', moveError);
          throw new Error(`Uploaded file finalization failed: ${formatErrorMessage(moveError)}`);
        }
      }
      
      // Save metadata JSON file for locally-managed URIs
      if (labData.uri.startsWith('Lab-')) {
        try {
          devLog.log('📁 Saving lab metadata JSON after blockchain creation...');
          setCreateLabProgress('💾 Saving lab metadata (offchain)...');
          await saveLabDataMutation.mutateAsync({
            ...labData,
            id: blockchainLabId, // Use the blockchain labId
            price: originalPrice, // Save with human-readable price for JSON consistency
            onchainUri            // Ensures onSuccess updates the correct cache key (full blob URL)
          });
          
          // Add a small delay to ensure cache propagation in production
          await new Promise(resolve => setTimeout(resolve, 150));
          metadataSaved = true;
          creationStage = advanceLabCreationStage(creationStage, 'contentActivated');
          devLog.log('✅ Lab metadata JSON saved successfully');
        } catch (error) {
          devLog.error('❌ Failed to save lab metadata JSON:', error);
          throw new Error(`Lab metadata finalization failed: ${formatErrorMessage(error)}`);
        }
      } else {
        creationStage = advanceLabCreationStage(creationStage, 'contentActivated');
      }

      // Ensure UI shows the provided lab name immediately by updating the cache
      try {
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
          if (!Array.isArray(old)) return old;
          if (isLabIdListCache(old)) {
            const normalizedId = Number(blockchainLabId);
            const hasId = old.some((entry) => String(entry) === String(blockchainLabId));
            if (hasId) return old;
            return Number.isFinite(normalizedId) ? [normalizedId, ...old] : [blockchainLabId, ...old];
          }

          // If lab exists in the list, replace it; otherwise add it to the top
          const exists = old.some(l => l?.labId === blockchainLabId || l?.id === blockchainLabId);
          if (exists) return old.map(l => (l?.labId === blockchainLabId || l?.id === blockchainLabId) ? { ...l, ...immediateUpdate } : l);
          return [{ ...immediateUpdate }, ...old];
        });
      } catch (err) {
        devLog.warn('Failed to apply immediate lab cache update:', err);
      }

      // Close modal and notify success
      try {
        setIsModalOpen(false);
        notifyLabCreated(addTemporaryNotification, labData?.id);
      } catch (err) {
        devLog.warn('Failed to close modal or notify success:', err);
      } finally {
        clearCreateLabProgress();
      }
    } catch (error) {
      devLog.error('Error adding lab:', error);
      handleMissingWebauthnCredential(error);
      const reason = error?.message || 'Unknown error';
      if (shouldCompensateLabCreation(creationStage) || tempFiles.length > 0) {
        const compensated = await compensateCreation(reason);
        notifyLabCreateFailed(
          addTemporaryNotification,
          compensated ? `${reason} (on-chain creation rolled back)` : reason
        );
      } else {
        notifyLabCreateFailed(addTemporaryNotification, reason);
      }
      clearCreateLabProgress();
    } finally {
      setIsCreatingLab(false);
      createLabAbortControllerRef.current = null;
    }
  }, [
    addLabMutation,
    addTemporaryNotification,
    clearCreateLabProgress,
    deleteFileMutation,
    deleteLabDataMutation,
    deleteLabMutation,
    handleMissingWebauthnCredential,
    institutionBackendUrl,
    isSSO,
    moveFilesMutation,
    ownedLabs,
    providerOwnerAddress,
    queryClient,
    saveLabDataMutation,
    setCreateLabProgress,
    user?.email,
    user?.institutionName,
    user?.name,
  ]);

  const handleCloseModal = useCallback(() => {
    if (isCreatingLab && createLabAbortControllerRef.current) {
      try {
        createLabAbortControllerRef.current.abort();
        notifyLabCreateCancelled(addTemporaryNotification);
      } catch (err) {
        devLog.error('Failed aborting create-lab request:', err);
      } finally {
        clearCreateLabProgress();
      }
    }

    setIsModalOpen(false);
  }, [addTemporaryNotification, clearCreateLabProgress, isCreatingLab]);

  // Automatically set the first lab as the selected lab (only once)
  useEffect(() => {
    if (ownedLabs.length > 0 && !selectedLabId && !isModalOpen && !hasInitialized.current) {
      const firstLabId = ownedLabs[0]?.id;
      if (firstLabId) {
        setSelectedLabId(String(firstLabId));
        hasInitialized.current = true;
      }
    }
  }, [ownedLabs, selectedLabId, isModalOpen]);
  
  // Handle saving a lab (either when editing an existing one or adding a new one)
  const handleSaveLab = async (labData) => {
    // Store the original human-readable price for local state updates
    const originalPrice = labData.price;
    const priceWasUnchangedDuringEdit =
      labData.id &&
      labData._originalRawPrice !== undefined &&
      labData._originalRawPrice !== null &&
      String(labData.price ?? '').trim() === String(labData._originalDisplayPrice ?? '').trim()
    
    // Convert price from user input to credit units for blockchain operations
    if (labData.price && decimals) {
      try {
        if (priceWasUnchangedDuringEdit) {
          labData = { ...labData, price: String(labData._originalRawPrice) }
        } else {
          const priceUnit = normalizePricingUnit(labData?.priceUnit || labData?.pricing?.displayUnit || 'hour')
          const priceInTokenUnits = displayPriceToRawPerSecond(labData.price, priceUnit, decimals)
          labData = { ...labData, price: priceInTokenUnits.toString() }
        }
      } catch (error) {
        devLog.error('Error converting price to credit units:', error)
        return
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
    const providerSegmentSource = user?.institutionName || user?.name;
    labData.uri = buildProviderLabUri(labData.uri || originalLab?.uri, providerSegmentSource, labData.id);
    const onchainUri = resolveOnchainLabUri(labData.uri, { labId: labData.id });

    const wasLocalJson = originalLab.uri && originalLab.uri.startsWith('Lab-');
    const isNowExternal = labData.uri && (labData.uri.startsWith('http://') || 
                          labData.uri.startsWith('https://'));
    const mustDeleteOldJson = wasLocalJson && isNowExternal;

    // Helper function to normalize values for comparison (treat undefined/null as empty string)
    const normalize = (value) => value === undefined || value === null ? '' : value;
    const originalResourceType = normalizeResourceTypeCode(originalLab?.resourceType)
    const nextResourceType = normalizeResourceTypeCode(labData?.resourceType)
    const originalAccessKey = resolveEffectiveOnchainAccessKey(originalLab, originalResourceType)
    const nextAccessKey = resolveEffectiveOnchainAccessKey(labData, nextResourceType)
    const originalUriForComparison = normalizeMetadataUriForComparison(originalLab.uri)
    const nextUriForComparison = normalizeMetadataUriForComparison(onchainUri)
    const originalAccessUriForComparison = normalizeAccessUriForComparison(originalLab.accessURI)
    const nextAccessUriForComparison = normalizeAccessUriForComparison(labData.accessURI)
    
    // ONLY compare on-chain fields that are stored in the smart contract
    // According to smart contract ABI: uri, price, accessURI, accessKey, resourceType
    const onChainComparison = {
      uri: { original: normalize(originalUriForComparison), new: normalize(nextUriForComparison) },
      price: { original: normalize(originalLab.price), new: normalize(labData.price) },
      accessURI: { original: normalize(originalAccessUriForComparison), new: normalize(nextAccessUriForComparison) },
      accessKey: { original: normalize(originalAccessKey), new: normalize(nextAccessKey) },
      resourceType: { original: originalResourceType, new: nextResourceType },
    }
    Object.keys(onChainComparison).forEach((key) => {
      onChainComparison[key].changed = onChainComparison[key].original !== onChainComparison[key].new
    })
    const changedOnChainFields = Object.entries(onChainComparison)
      .filter(([, value]) => value.changed)
      .map(([key]) => key)
    const hasChangedOnChainData = changedOnChainFields.length > 0;

    // Debug logging to help identify what's causing transaction triggers
    devLog.log('📁 On-chain comparison debug:', {
      ...onChainComparison,
      changedOnChainFields,
      hasChangedOnChainData
    });

    try {
      if (hasChangedOnChainData) {
        // 1a. If there are on-chain changes, update blockchain via mutation
        const actionKey = `update:${labData.id}`;
        setActionProgressNotification(actionKey, 'Updating lab onchain...');
        setOptimisticLabState(String(labData.id), { editing: true, isPending: true });
        devLog.log('ProviderDashboard: Executing blockchain update for on-chain changes');

        // Use React Query mutation - it will route to correct service based on isSSO
        try {
          await updateLabMutation.mutateAsync({
            labId: labData.id,
            labData: {
              uri: onchainUri,
              price: labData.price, // Already in credit units
              accessURI: labData.accessURI,
              accessKey: labData.accessKey,
              resourceType: nextResourceType,
            },
            backendUrl: institutionBackendUrl
          });

          clearActionProgressNotification(actionKey);
          notifyLabUpdated(addTemporaryNotification, labData.id);
          // Clear optimistic editing marker
          clearOptimisticLabState(String(labData.id));
        } catch (err) {
          devLog.error('Error updating lab onchain:', err);
          err.onChainComparison = onChainComparison;
          err.changedOnChainFields = changedOnChainFields;
          clearActionProgressNotification(actionKey);
          clearOptimisticLabState(String(labData.id));
          try {
            queryClient?.invalidateQueries({ queryKey: labQueryKeys.isTokenListed(labData.id), exact: true });
            queryClient?.invalidateQueries({ queryKey: labQueryKeys.getAllLabs(), exact: true });
          } catch (cacheErr) {
            devLog.warn('Failed to invalidate cache after update error:', cacheErr);
          }
          handleMissingWebauthnCredential(err);
          if (!handleLabAuthorizationErrorToast(err)) {
            notifyLabUpdateFailed(addTemporaryNotification, labData.id, formatErrorMessage(err));
          }
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
              price: originalPrice, // Save with human-readable price for JSON consistency
              onchainUri             // Passed so onSuccess can invalidate the correct cache key
            });
            
            // Add a small delay to ensure cache propagation in production
            await new Promise(resolve => setTimeout(resolve, 150));
            
            notifyLabMetadataUpdated(addTemporaryNotification, labData.id);
          } catch (error) {
            if (!handleLabAuthorizationErrorToast(error)) {
              notifyLabMetadataSaveFailed(addTemporaryNotification, labData.id, formatErrorMessage(error));
            }
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
            price: originalPrice, // Save with human-readable price for JSON consistency
            onchainUri             // Passed so onSuccess can invalidate the correct cache key
          });
          
          // Add a small delay to ensure cache propagation in production
          await new Promise(resolve => setTimeout(resolve, 150));
          
        } catch (error) {
          if (!handleLabAuthorizationErrorToast(error)) {
            notifyLabMetadataSaveFailed(addTemporaryNotification, labData.id, formatErrorMessage(error));
          }
          return;
        }
      }

      // 3. Delete the old JSON if necessary
      if (mustDeleteOldJson) {
        await deleteLabDataMutation.mutateAsync(originalLab.uri);
      }
    } catch (error) {
      devLog.error('Error updating lab:', error);
      handleMissingWebauthnCredential(error);
      if (!handleLabAuthorizationErrorToast(error)) {
        notifyLabUpdateFailed(addTemporaryNotification, labData.id, formatErrorMessage(error));
      }
    }
  }

  // Handle delete a lab using React Query mutation
  const handleDeleteLab = async (labId) => {
    const actionKey = `delete:${labId}`;
    try {
      // Optimistic UI: mark deleting and provide immediate feedback
      setActionProgressNotification(actionKey, 'Deleting lab...');
      setOptimisticLabState(String(labId), { deleting: true, isPending: true });

      // 🚀 Use React Query mutation for lab deletion
      const labToDelete = ownedLabs.find((entry) => String(entry?.id ?? entry?.labId) === String(labId));
      const deleteResult = await deleteLabMutation.mutateAsync({ labId, backendUrl: institutionBackendUrl });
      if (deleteResult?.status !== 'executed') {
        clearActionProgressNotification(actionKey);
        clearOptimisticLabState(String(labId));
        return;
      }
      try {
        await cleanupLabDataMutation.mutateAsync({
          labId,
          txHash: deleteResult.txHash,
          metadataUri: extractLocalMetadataUri(labToDelete?.uri),
        });
      } catch (cleanupError) {
        // Chain deletion is final; leave the lab removed from the UI while
        // surfacing that storage cleanup should be retried operationally.
        devLog.error('Marketplace lab storage cleanup failed after on-chain deletion:', cleanupError);
        notifyLabStorageCleanupWarning(addTemporaryNotification, labId);
      }

      // Remove from cached list immediately when possible
      try {
        queryClient.setQueryData(labQueryKeys.getAllLabs(), (old = []) => (
          Array.isArray(old)
            ? old.filter((entry) => {
                const candidateId = typeof entry === 'object' && entry !== null
                  ? (entry.id ?? entry.labId)
                  : entry;
                return String(candidateId) !== String(labId);
              })
            : old
        ));
      } catch (cacheErr) {
        devLog.warn('Failed to remove deleted lab from cache immediately:', cacheErr);
      }

      clearActionProgressNotification(actionKey);
      notifyLabDeleted(addTemporaryNotification, labId);

      // React Query mutations and event contexts will further ensure cache consistency
      devLog.log('🗑️ Lab deleted, cache cleanup will be handled automatically by event contexts');

      // Clear optimistic deleting state
      clearOptimisticLabState(String(labId));
    } catch (error) {
      devLog.error('Error deleting lab:', error);
      clearActionProgressNotification(actionKey);
      clearOptimisticLabState(labId);
      try {
        queryClient?.invalidateQueries({ queryKey: labQueryKeys.isTokenListed(labId), exact: true });
        queryClient?.invalidateQueries({ queryKey: labQueryKeys.getAllLabs(), exact: true });
      } catch (cacheErr) {
        devLog.warn('Failed to invalidate cache after delete error:', cacheErr);
      }
      handleMissingWebauthnCredential(error);
      if (!handleLabAuthorizationErrorToast(error)) {
        notifyLabDeleteFailed(addTemporaryNotification, labId, error?.message || 'Unknown error');
      }
    }
  };

  // Handle listing a lab using React Query mutation
  const handleList = async (labId) => {
    const actionKey = `list:${labId}`;
    try {
      // Immediate user feedback: notify and set optimistic pending state
      setListingProgressNotification(actionKey, 'Listing lab...');
      setOptimisticListingState(String(labId), true, true);

      // Use React Query mutation for lab listing
      await listLabMutation.mutateAsync({ labId, backendUrl: institutionBackendUrl });
      
      // Mark optimistic as completed (still keep new state)
      clearListingProgressNotification(actionKey);
      completeOptimisticListingState(String(labId));

      // Immediately update cache so UI reflects onchain change without waiting for events
      handleUpdateListingCache(labId, true);

      notifyLabListed(addTemporaryNotification, labId);
    } catch (error) {
      devLog.error('Error listing lab:', error);
      clearListingProgressNotification(actionKey);
      // Clear optimistic pending state on error
      clearOptimisticListingState(String(labId));
      try {
        queryClient?.invalidateQueries({ queryKey: labQueryKeys.isTokenListed(labId), exact: true });
        queryClient?.invalidateQueries({ queryKey: labQueryKeys.getAllLabs(), exact: true });
      } catch (cacheErr) {
        devLog.warn('Failed to invalidate cache after list error:', cacheErr);
      }
      handleMissingWebauthnCredential(error);
      if (!handleLabAuthorizationErrorToast(error)) {
        notifyLabListFailed(addTemporaryNotification, labId, error?.message || 'Unknown error');
      }
    }
  };
  
  // Handle unlisting a lab using React Query mutation
  const handleUnlist = async (labId) => {
    try {
      // Immediate user feedback: notify and set optimistic pending state
      setListingProgressNotification(labId, 'Unlisting lab...');
      setOptimisticListingState(String(labId), false, true);

      // Use React Query mutation for lab unlisting
      await unlistLabMutation.mutateAsync({ labId, backendUrl: institutionBackendUrl });
      
      // Mark optimistic as completed (keep new state)
      clearListingProgressNotification(labId);
      completeOptimisticListingState(String(labId));

      // Immediately update cache so UI reflects onchain change without waiting for events
      handleUpdateListingCache(labId, false);

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
      handleMissingWebauthnCredential(error);
      if (!handleLabAuthorizationErrorToast(error)) {
        notifyLabUnlistFailed(addTemporaryNotification, labId, error?.message || 'Unknown error');
      }
    }
  };

  const handleSelectChange = (e) => {
    setSelectedLabId(e.target.value);
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
      <Container padding="2xl">
        {/* Dashboard header */}
        <DashboardHeader title="Lab Panel" />

        <div className="grid grid-cols-1 min-[1080px]:grid-cols-[1fr_auto] min-[1080px]:gap-6">
          {/* Provider labs management */}
          <ProviderLabsList
            ownedLabs={ownedLabs}
            selectedLab={selectedLab}
            selectedLabId={selectedLabId}
            isLoading={loading}
            onSelectChange={handleSelectChange}
            onEdit={(labId) => {
              setSelectedLabId(String(labId));
              setIsModalOpen(true);
            }}
            onDelete={handleDeleteLab}
            onList={handleList}
            onUnlist={handleUnlist}
          />

          <div className="flex flex-col mt-6 min-[1080px]:mt-0">
            {/* Reservations calendar */}
            <ReservationsCalendar
              selectedDate={date}
              onDateChange={(newDate) => setDate(newDate)}
              bookingInfo={bookingInfo}
              minDate={today}
            />

              {/* Provider actions */}
              <ProviderActions
                onAddNewLab={() => {
                  setNewLab(createEmptyLabDraft());
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

