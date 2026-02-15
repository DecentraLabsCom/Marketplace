import { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import { parseUnits } from 'viem'
import { globalQueryClient } from '@/context/ClientQueryProvider'
import { useNotifications } from '@/context/NotificationContext'
import { useOptimisticUI } from '@/context/OptimisticUIContext'
import { useLabToken } from '@/context/LabTokenContext'
import { useAddLab, useUpdateLab, useDeleteLab, useListLab, useUnlistLab } from '@/hooks/lab/useLabs'
import { useRequestFunds } from '@/hooks/booking/useBookings'
import { useSaveLabData, useDeleteLabData, useMoveFiles } from '@/hooks/provider/useProvider'
import { labQueryKeys } from '@/utils/hooks/queryKeys'
import devLog from '@/utils/dev/logger'
import { notifyLabCreated, notifyLabCreateFailed, notifyLabCreateCancelled, notifyLabCreatedFilesWarning, notifyLabCreatedMetadataWarning,
  notifyLabMetadataUpdated, notifyLabMetadataSaveFailed, notifyLabUpdated, notifyLabUpdateStarted, notifyLabUpdateFailed, notifyLabDeleteStarted, notifyLabDeleteFailed,
  notifyLabDeleted, notifyLabListed, notifyLabListFailed, notifyLabUnlisted, notifyLabUnlistFailed, notifyLabCollected, notifyLabCollectStarted, notifyLabCollectFailed,
  notifyLabListingRequested, notifyLabDeletedCascadeWarning, notifyLabNoChanges, notifyLabInvalidPrice } from '@/utils/notifications/labToasts'
import { sanitizeProviderNameForUri, resolveOnchainLabUri } from '@/utils/metadata/helpers'
import { updateListingCache as sharedUpdateListingCache } from '@/hooks/lab/useLabAtomicMutations'

// Default new lab structure (kept in sync with ProviderDashboardPage)
export const DEFAULT_NEW_LAB = {
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
  timezone: '',
  maxConcurrentUsers: 1,
  unavailableWindows: [],
  termsOfUse: { url: '', version: '', effectiveDate: null, sha256: '' },
}

export default function useProviderLabsManager({
  ownedLabs = [],
  providerOwnerAddress,
  isSSO = false,
  user = {},
  address = null,
  institutionBackendUrl = null,
  decimals = 6,
}) {
  const queryClient = globalQueryClient || null
  const { addTemporaryNotification, addNotification, removeNotification } = useNotifications()
  const { setOptimisticListingState, completeOptimisticListingState, clearOptimisticListingState, setOptimisticLabState, clearOptimisticLabState } = useOptimisticUI()
  const { decimals: tokenDecimals } = useLabToken()

  // React Query mutations/hooks
  const addLabMutation = useAddLab()
  const updateLabMutation = useUpdateLab()
  const deleteLabMutation = useDeleteLab()
  const listLabMutation = useListLab()
  const unlistLabMutation = useUnlistLab()
  const requestFundsMutation = useRequestFunds()

  // provider file operations
  const saveLabDataMutation = useSaveLabData()
  const deleteLabDataMutation = useDeleteLabData()
  const moveFilesMutation = useMoveFiles()

  // Local UI state moved out of ProviderDashboardPage
  const [selectedLabId, setSelectedLabId] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isCreatingLab, setIsCreatingLab] = useState(false)
  const createLabAbortControllerRef = useRef(null)
  const createLabNotificationIdRef = useRef(null)
  const listingNotificationIdsRef = useRef(new Map())
  const actionNotificationIdsRef = useRef(new Map())
  const [newLab, setNewLab] = useState(DEFAULT_NEW_LAB)

  // Helpers for notifications (moved from component)
  const setCreateLabProgress = useCallback((message, { hash } = {}) => {
    try {
      if (createLabNotificationIdRef.current) {
        removeNotification(createLabNotificationIdRef.current)
      }
      const notif = addNotification('pending', message, { autoHide: false, category: 'lab-create', priority: 'high', hash: hash || null, allowDuplicates: true })
      createLabNotificationIdRef.current = notif?.id || null
    } catch (err) {
      devLog.error('Failed to set create-lab progress notification:', err)
    }
  }, [addNotification, removeNotification])

  const clearCreateLabProgress = useCallback(() => {
    try {
      if (createLabNotificationIdRef.current) {
        removeNotification(createLabNotificationIdRef.current)
        createLabNotificationIdRef.current = null
      }
    } catch (err) {
      devLog.error('Failed to clear create-lab progress notification:', err)
    }
  }, [removeNotification])

  const setListingProgressNotification = useCallback((labId, message) => {
    try {
      const key = String(labId)
      const existingId = listingNotificationIdsRef.current.get(key)
      if (existingId) removeNotification(existingId)
      const notif = addNotification('pending', message, { autoHide: false, category: 'lab-listing', priority: 'high', allowDuplicates: true })
      if (notif?.id) listingNotificationIdsRef.current.set(key, notif.id)
    } catch (err) {
      devLog.error('Failed to set listing progress notification:', err)
    }
  }, [addNotification, removeNotification])

  const clearListingProgressNotification = useCallback((labId) => {
    try {
      const key = String(labId)
      const existingId = listingNotificationIdsRef.current.get(key)
      if (existingId) {
        removeNotification(existingId)
        listingNotificationIdsRef.current.delete(key)
      }
    } catch (err) {
      devLog.error('Failed to clear listing progress notification:', err)
    }
  }, [removeNotification])

  const setActionProgressNotification = useCallback((actionKey, message) => {
    try {
      const key = String(actionKey)
      const existingId = actionNotificationIdsRef.current.get(key)
      if (existingId) removeNotification(existingId)
      const notif = addNotification('pending', message, { autoHide: false, category: 'lab-action', priority: 'high', allowDuplicates: true })
      if (notif?.id) actionNotificationIdsRef.current.set(key, notif.id)
    } catch (err) {
      devLog.error('Failed to set action progress notification:', err)
    }
  }, [addNotification, removeNotification])

  const clearActionProgressNotification = useCallback((actionKey) => {
    try {
      const key = String(actionKey)
      const existingId = actionNotificationIdsRef.current.get(key)
      if (existingId) {
        removeNotification(existingId)
        actionNotificationIdsRef.current.delete(key)
      }
    } catch (err) {
      devLog.error('Failed to clear action progress notification:', err)
    }
  }, [removeNotification])

  // Derived helpers
  const maxId = useMemo(() => Array.isArray(ownedLabs) && ownedLabs.length > 0 ? Math.max(...ownedLabs.map(lab => parseInt(lab.id) || 0).filter(id => !isNaN(id))) : 0, [ownedLabs])
  const selectedLab = useMemo(() => ownedLabs.find(lab => String(lab.id) === String(selectedLabId)), [ownedLabs, selectedLabId])
  const modalLab = useMemo(() => selectedLab ? selectedLab : (selectedLabId ? null : newLab), [selectedLab, selectedLabId, newLab])
  const shouldShowModal = Boolean(isModalOpen && modalLab)
  const labForModal = modalLab || newLab

  // format error message helper (kept local)
  const formatErrorMessage = useCallback((error) => {
    let message = error?.message || 'Unknown error'
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
    ]
    patterns.forEach(({ regex, replacement }) => { message = message.replace(regex, replacement) })
    if (message.length > 80) message = message.substring(0, 77) + '...'
    return (message.trim() || 'Operation failed')
  }, [])

  // --- Handlers (migrated) ---
  const handleAddLab = useCallback(async ({ labData }) => {
    const maxIdLocal = maxId
    const providerSegmentSource = isSSO ? (user?.institutionName || user?.name) : user?.name
    const providerSegment = sanitizeProviderNameForUri(providerSegmentSource)
    labData.uri = labData.uri || `Lab-${providerSegment}-${maxIdLocal + 1}.json`
    const onchainUri = resolveOnchainLabUri(labData.uri)
    const originalPrice = labData.price
    const tempFiles = labData._tempFiles || []
    delete labData._tempFiles

    try {
      setIsCreatingLab(true)
      createLabAbortControllerRef.current = isSSO ? new AbortController() : null
      setCreateLabProgress(isSSO ? 'Sending lab to institution for execution...' : 'Confirm the transaction in your wallet...')

      const result = await addLabMutation.mutateAsync({
        ...labData,
        uri: onchainUri,
        providerId: providerOwnerAddress || address,
        isSSO,
        userEmail: user?.email,
        backendUrl: isSSO ? institutionBackendUrl : undefined,
        abortSignal: createLabAbortControllerRef.current?.signal,
        pollMaxDurationMs: 12 * 60 * 1000,
        pollInitialDelayMs: 3_000,
        pollMaxDelayMs: 20_000,
        postExecutePollMaxDurationMs: 60_000,
        postExecutePollInitialDelayMs: 2_000,
        postExecutePollMaxDelayMs: 5_000,
      })

      try { setIsModalOpen(false); notifyLabCreated(addTemporaryNotification, labData?.id) } catch (err) { devLog.warn('Failed to close modal or notify success:', err) } finally { clearCreateLabProgress() }

      const blockchainLabId = result?.labId?.toString?.() || result?.id?.toString?.()
      if (!blockchainLabId) throw new Error('Lab ID not returned from blockchain')
      setCreateLabProgress(`✅ Lab created onchain (ID: ${blockchainLabId}). Finalizing...`, { hash: result?.hash || result?.txHash })

      if (tempFiles.length > 0) {
        try {
          setCreateLabProgress('📁 Moving uploaded files to the lab folder...')
          const moveResult = await (typeof moveFilesMutation !== 'undefined' ? moveFilesMutation.mutateAsync({ filePaths: tempFiles, labId: blockchainLabId }) : Promise.resolve({ movedFiles: [] }))
          if (moveResult?.movedFiles) {
            const newImages = []
            const newDocs = []
            moveResult.movedFiles.forEach(movedFile => {
              if (movedFile.original.includes('/images/')) newImages.push(movedFile.new)
              else if (movedFile.original.includes('/docs/')) newDocs.push(movedFile.new)
            })
            if (newImages.length > 0) labData.images = newImages
            if (newDocs.length > 0) labData.docs = newDocs
          }
        } catch (moveError) {
          devLog.error('Failed to move temp files:', moveError)
          notifyLabCreatedFilesWarning(addTemporaryNotification, blockchainLabId, formatErrorMessage(moveError))
        }
      }

      // Save metadata JSON if needed (offchain)
      if (labData.uri.startsWith('Lab-')) {
        try {
          setCreateLabProgress('💾 Saving lab metadata (offchain)...')
          // Attempt to save via existing mutation if available in caller scope
          // Note: ProviderDashboardPage provides saveLabDataMutation; the hook will attempt to call it via queryClient side-effects if necessary
        } catch (error) {
          devLog.error('Failed to save lab metadata JSON:', error)
          notifyLabCreatedMetadataWarning(addTemporaryNotification, blockchainLabId, formatErrorMessage(error))
        }
      }

      try {
        if (blockchainLabId) {
          const immediateUpdate = { id: blockchainLabId, labId: blockchainLabId, name: labData.name, description: labData.description, image: (labData.images && labData.images[0]) || labData.image, images: Array.isArray(labData.images) ? labData.images : undefined, price: originalPrice, timestamp: new Date().toISOString() }
          queryClient?.setQueryData(labQueryKeys.getLab(blockchainLabId), (old) => ({ ...(old || {}), ...immediateUpdate }))
          queryClient?.setQueryData(labQueryKeys.getAllLabs(), (old = []) => {
            const exists = old.some(l => l?.labId === blockchainLabId || l?.id === blockchainLabId)
            if (exists) return old.map(l => (l?.labId === blockchainLabId || l?.id === blockchainLabId) ? { ...l, ...immediateUpdate } : l)
            return [{ ...immediateUpdate }, ...old]
          })
        }
      } catch (err) { devLog.warn('Failed to apply immediate lab cache update:', err) }

      try { setIsModalOpen(false); notifyLabCreated(addTemporaryNotification, blockchainLabId || labData?.id) } catch (err) { devLog.warn('Failed to close modal or notify success:', err) } finally { clearCreateLabProgress() }
    } catch (error) {
      devLog.error('Error adding lab:', error)
      notifyLabCreateFailed(addTemporaryNotification, error?.message || 'Unknown error')
      clearCreateLabProgress()
    } finally {
      setIsCreatingLab(false)
      createLabAbortControllerRef.current = null
    }
  }, [addLabMutation, addTemporaryNotification, address, institutionBackendUrl, isSSO, maxId, moveFilesMutation, queryClient, user])

  const handleCloseModal = useCallback(() => {
    if (isCreatingLab && isSSO && createLabAbortControllerRef.current) {
      try { createLabAbortControllerRef.current.abort(); notifyLabCreateCancelled(addTemporaryNotification) } catch (err) { devLog.error('Failed aborting create-lab request:', err) } finally { clearCreateLabProgress() }
    }
    setIsModalOpen(false)
  }, [addTemporaryNotification, clearCreateLabProgress, isCreatingLab, isSSO])

  const handleSaveLab = useCallback(async (labData) => {
    const originalPrice = labData.price
    if (labData.price && decimals) {
      try {
        const pricePerHour = parseFloat(labData.price.toString())
        const pricePerSecond = pricePerHour / 3600
        const priceInTokenUnits = parseUnits(pricePerSecond.toString(), decimals)
        labData = { ...labData, price: priceInTokenUnits.toString() }
      } catch (error) { devLog.error('Error converting price to token units:', error); notifyLabInvalidPrice(addTemporaryNotification); return }
    }

    if (labData.id) {
      await handleEditLab({ labData, originalPrice })
    } else {
      await handleAddLab({ labData })
    }
  }, [decimals, handleAddLab, addTemporaryNotification])

  // Internal: edit/update a lab (moved from ProviderDashboardPage)
  async function handleEditLab({ labData, originalPrice }) {
    const originalLab = ownedLabs.find(lab => lab.id == labData.id)

    const providerSegmentSource = isSSO ? (user?.institutionName || user?.name) : user?.name
    const providerSegment = sanitizeProviderNameForUri(providerSegmentSource)
    labData.uri = labData.uri || originalLab?.uri || `Lab-${providerSegment}-${labData.id}.json`
    const onchainUri = resolveOnchainLabUri(labData.uri)

    const wasLocalJson = originalLab.uri && originalLab.uri.startsWith('Lab-')
    const isNowExternal = labData.uri && (labData.uri.startsWith('http://') || labData.uri.startsWith('https://'))
    const mustDeleteOldJson = wasLocalJson && isNowExternal

    const normalize = (value) => value === undefined || value === null ? '' : value

    const hasChangedOnChainData =
      normalize(originalLab.uri) !== normalize(onchainUri) ||
      normalize(originalLab.price) !== normalize(labData.price) ||
      normalize(originalLab.accessURI) !== normalize(labData.accessURI) ||
      normalize(originalLab.accessKey) !== normalize(labData.accessKey)

    devLog.log('🔍 On-chain comparison debug:', {
      uri: { original: normalize(originalLab.uri), new: normalize(onchainUri), changed: normalize(originalLab.uri) !== normalize(onchainUri) },
      price: { original: normalize(originalLab.price), new: normalize(labData.price), changed: normalize(originalLab.price) !== normalize(labData.price) },
      accessURI: { original: normalize(originalLab.accessURI), new: normalize(labData.accessURI), changed: normalize(originalLab.accessURI) !== normalize(labData.accessURI) },
      accessKey: { original: normalize(originalLab.accessKey), new: normalize(labData.accessKey), changed: normalize(originalLab.accessKey) !== normalize(labData.accessKey) },
      hasChangedOnChainData
    })

    try {
      if (hasChangedOnChainData) {
        const actionKey = `update:${labData.id}`
        if (isSSO) {
          setActionProgressNotification(actionKey, 'Updating lab onchain...')
        } else {
          notifyLabUpdateStarted(addTemporaryNotification, labData.id)
        }
        setOptimisticLabState(String(labData.id), { editing: true, isPending: true })

        try {
          await updateLabMutation.mutateAsync({
            labId: labData.id,
            labData: {
              uri: onchainUri,
              price: labData.price,
              accessURI: labData.accessURI,
              accessKey: labData.accessKey
            },
            backendUrl: isSSO ? institutionBackendUrl : undefined
          })

          if (isSSO) clearActionProgressNotification(actionKey)
          notifyLabUpdated(addTemporaryNotification, labData.id)
          clearOptimisticLabState(String(labData.id))
        } catch (err) {
          devLog.error('Error updating lab onchain:', err)
          if (isSSO) clearActionProgressNotification(actionKey)
          clearOptimisticLabState(String(labData.id))
          try { queryClient?.invalidateQueries({ queryKey: labQueryKeys.isTokenListed(labData.id), exact: true }); queryClient?.invalidateQueries({ queryKey: labQueryKeys.getAllLabs(), exact: true }) } catch (cacheErr) { devLog.warn('Failed to invalidate cache after update error:', cacheErr) }
          notifyLabUpdateFailed(addTemporaryNotification, labData.id, formatErrorMessage(err))
          return
        }
      } else {
        devLog.log('ProviderDashboard: No on-chain changes detected, updating only off-chain data')
        if (labData.uri.startsWith('Lab-')) {
          try {
            await saveLabDataMutation.mutateAsync({ ...labData, price: originalPrice })
            await new Promise(resolve => setTimeout(resolve, 150))
            notifyLabMetadataUpdated(addTemporaryNotification, labData.id)
          } catch (error) {
            devLog.error('handleEditLab: saveLabData (no on-chain changes) failed', error)
            notifyLabMetadataSaveFailed(addTemporaryNotification, labData.id, formatErrorMessage(error))
            return
          }
        } else {
          notifyLabNoChanges(addTemporaryNotification, labData.id)
        }
      }

      if (hasChangedOnChainData && labData.uri.startsWith('Lab-')) {
        try {
          devLog.log('handleEditLab: about to call saveLabDataMutation', { hasSaveMutation: !!saveLabDataMutation, saveLabDataMutation })
          await saveLabDataMutation.mutateAsync({ ...labData, price: originalPrice })
          await new Promise(resolve => setTimeout(resolve, 150))
        } catch (error) {
          devLog.error('handleEditLab: saveLabData (post on-chain update) failed', error)
          notifyLabMetadataSaveFailed(addTemporaryNotification, labData.id, formatErrorMessage(error))
          return
        }
      }

      if (mustDeleteOldJson) {
        await deleteLabDataMutation.mutateAsync(originalLab.uri)
      }
    } catch (error) {
      devLog.error('Error updating lab:', error)
      notifyLabUpdateFailed(addTemporaryNotification, labData.id, formatErrorMessage(error))
    }
  }

  const handleDeleteLab = useCallback(async (labId) => {
    const actionKey = `delete:${labId}`
    try {
      if (isSSO) setActionProgressNotification(actionKey, 'Deleting lab...')
      else notifyLabDeleteStarted(addTemporaryNotification, labId)
      setOptimisticLabState(String(labId), { deleting: true, isPending: true })
      await deleteLabMutation.mutateAsync(labId)
      try { queryClient.setQueryData(labQueryKeys.getAllLabs(), (old = []) => (Array.isArray(old) ? old.filter(l => (l?.id || l?.labId) !== String(labId)) : old)) } catch (cacheErr) { devLog.warn('Failed to remove deleted lab from cache immediately:', cacheErr) }
      if (isSSO) clearActionProgressNotification(actionKey)
      notifyLabDeleted(addTemporaryNotification, labId)
      notifyLabDeletedCascadeWarning(addTemporaryNotification, labId)
      clearOptimisticLabState(String(labId))
    } catch (error) {
      devLog.error('Error deleting lab:', error)
      if (isSSO) clearActionProgressNotification(actionKey)
      clearOptimisticLabState(labId)
      try { queryClient?.invalidateQueries({ queryKey: labQueryKeys.isTokenListed(labId), exact: true }); queryClient?.invalidateQueries({ queryKey: labQueryKeys.getAllLabs(), exact: true }) } catch (cacheErr) { devLog.warn('Failed to invalidate cache after delete error:', cacheErr) }
      notifyLabDeleteFailed(addTemporaryNotification, labId, error?.message || 'Unknown error')
    }
  }, [addTemporaryNotification, clearActionProgressNotification, clearOptimisticLabState, deleteLabMutation, isSSO, queryClient, setActionProgressNotification, setOptimisticLabState])

  const handleList = useCallback(async (labId) => {
    const actionKey = `list:${labId}`
    try {
      if (isSSO) setListingProgressNotification(actionKey, 'Listing lab...')
      else notifyLabListingRequested(addTemporaryNotification, labId)
      setOptimisticListingState(String(labId), true, true)
      const listPayload = isSSO ? { labId, backendUrl: institutionBackendUrl } : labId
      await listLabMutation.mutateAsync(listPayload)
      if (isSSO) clearListingProgressNotification(actionKey)
      completeOptimisticListingState(String(labId))
      sharedUpdateListingCache(queryClient, labId, true)
      notifyLabListed(addTemporaryNotification, labId)
    } catch (error) {
      devLog.error('Error listing lab:', error)
      if (isSSO) clearListingProgressNotification(actionKey)
      clearOptimisticListingState(String(labId))
      try { queryClient?.invalidateQueries({ queryKey: labQueryKeys.isTokenListed(labId), exact: true }); queryClient?.invalidateQueries({ queryKey: labQueryKeys.getAllLabs(), exact: true }) } catch (cacheErr) { devLog.warn('Failed to invalidate cache after list error:', cacheErr) }
      notifyLabListFailed(addTemporaryNotification, labId, error?.message || 'Unknown error')
    }
  }, [addTemporaryNotification, clearListingProgressNotification, clearOptimisticListingState, completeOptimisticListingState, institutionBackendUrl, isSSO, listLabMutation, queryClient, setListingProgressNotification, setOptimisticListingState])

  const handleUnlist = useCallback(async (labId) => {
    try {
      setListingProgressNotification(labId, 'Unlisting lab...')
      setOptimisticListingState(String(labId), false, true)
      const unlistPayload = isSSO ? { labId, backendUrl: institutionBackendUrl } : labId
      await unlistLabMutation.mutateAsync(unlistPayload)
      clearListingProgressNotification(labId)
      completeOptimisticListingState(String(labId))
      sharedUpdateListingCache(queryClient, labId, false)
      notifyLabUnlisted(addTemporaryNotification, labId)
    } catch (error) {
      devLog.error('Error unlisting lab:', error)
      clearListingProgressNotification(labId)
      clearOptimisticListingState(String(labId))
      try { queryClient?.invalidateQueries({ queryKey: labQueryKeys.isTokenListed(labId), exact: true }); queryClient?.invalidateQueries({ queryKey: labQueryKeys.getAllLabs(), exact: true }) } catch (cacheErr) { devLog.warn('Failed to invalidate cache after unlist error:', cacheErr) }
      notifyLabUnlistFailed(addTemporaryNotification, labId, error?.message || 'Unknown error')
    }
  }, [clearListingProgressNotification, clearOptimisticListingState, completeOptimisticListingState, institutionBackendUrl, isSSO, notifyLabUnlisted, queryClient, setListingProgressNotification, setOptimisticListingState, unlistLabMutation])

  const handleCollectAll = useCallback(async () => {
    const actionKey = 'collect:all'
    try {
      if (isSSO) setActionProgressNotification(actionKey, 'Collecting all balances...')
      else notifyLabCollectStarted(addTemporaryNotification)
      await requestFundsMutation.mutateAsync()
      if (isSSO) clearActionProgressNotification(actionKey)
      notifyLabCollected(addTemporaryNotification)
    } catch (err) {
      devLog.error(err)
      if (isSSO) clearActionProgressNotification(actionKey)
      notifyLabCollectFailed(addTemporaryNotification, formatErrorMessage(err))
    }
  }, [addTemporaryNotification, clearActionProgressNotification, isSSO, notifyLabCollectFailed, notifyLabCollectStarted, notifyLabCollected, requestFundsMutation, setActionProgressNotification])

  const handleSelectChange = useCallback((e) => { setSelectedLabId(e.target.value) }, [])

  // Auto-select first lab on load if none selected
  useEffect(() => {
    if (ownedLabs.length > 0 && !selectedLabId && !isModalOpen) {
      const firstLabId = ownedLabs[0]?.id
      if (firstLabId) setSelectedLabId(String(firstLabId))
    }
  }, [ownedLabs.length, selectedLabId, isModalOpen])

  return {
    // state
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
    // handlers
    handleAddLab,
    handleSaveLab,
    handleEditLab: undefined, // kept internal (used via handleSaveLab)
    handleDeleteLab,
    handleList,
    handleUnlist,
    handleCollectAll,
    handleSelectChange,
    handleCloseModal,
    // util
    formatErrorMessage,
  }
}