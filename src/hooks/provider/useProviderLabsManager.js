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
import { 
  notifyLabCreated, notifyLabCreateFailed, notifyLabCreateCancelled, notifyLabCreatedFilesWarning, notifyLabCreatedMetadataWarning,
  notifyLabMetadataUpdated, notifyLabMetadataSaveFailed, notifyLabUpdated, notifyLabUpdateStarted, notifyLabUpdateFailed, notifyLabDeleteStarted, notifyLabDeleteFailed,
  notifyLabDeleted, notifyLabListed, notifyLabListFailed, notifyLabUnlisted, notifyLabUnlistFailed, notifyLabCollected, notifyLabCollectStarted, notifyLabCollectFailed,
  notifyLabListingRequested, notifyLabDeletedCascadeWarning, notifyLabNoChanges, notifyLabInvalidPrice 
} from '@/utils/notifications/labToasts'
import { sanitizeProviderNameForUri, resolveOnchainLabUri } from '@/utils/metadata/helpers'
import { updateListingCache as sharedUpdateListingCache } from '@/hooks/lab/useLabAtomicMutations'

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

  // Mutations
  const addLabMutation = useAddLab()
  const updateLabMutation = useUpdateLab()
  const deleteLabMutation = useDeleteLab()
  const listLabMutation = useListLab()
  const unlistLabMutation = useUnlistLab()
  const requestFundsMutation = useRequestFunds()
  const saveLabDataMutation = useSaveLabData()
  const deleteLabDataMutation = useDeleteLabData()
  const moveFilesMutation = useMoveFiles()

  // Local UI state
  const [selectedLabId, setSelectedLabId] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isCreatingLab, setIsCreatingLab] = useState(false)
  const createLabAbortControllerRef = useRef(null)
  const createLabNotificationIdRef = useRef(null)
  const listingNotificationIdsRef = useRef(new Map())
  const actionNotificationIdsRef = useRef(new Map())
  const [newLab, setNewLab] = useState(DEFAULT_NEW_LAB)

  // Notifications helpers
  const setCreateLabProgress = useCallback((message, { hash } = {}) => {
    if (createLabNotificationIdRef.current) removeNotification(createLabNotificationIdRef.current)
    const notif = addNotification('pending', message, { autoHide: false, category: 'lab-create', priority: 'high', hash: hash || null, allowDuplicates: true })
    createLabNotificationIdRef.current = notif?.id || null
  }, [addNotification, removeNotification])

  const clearCreateLabProgress = useCallback(() => {
    if (createLabNotificationIdRef.current) {
      removeNotification(createLabNotificationIdRef.current)
      createLabNotificationIdRef.current = null
    }
  }, [removeNotification])

  const setListingProgressNotification = useCallback((labId, message) => {
    const key = String(labId)
    const existingId = listingNotificationIdsRef.current.get(key)
    if (existingId) removeNotification(existingId)
    const notif = addNotification('pending', message, { autoHide: false, category: 'lab-listing', priority: 'high', allowDuplicates: true })
    if (notif?.id) listingNotificationIdsRef.current.set(key, notif.id)
  }, [addNotification, removeNotification])

  const clearListingProgressNotification = useCallback((labId) => {
    const key = String(labId)
    const existingId = listingNotificationIdsRef.current.get(key)
    if (existingId) {
      removeNotification(existingId)
      listingNotificationIdsRef.current.delete(key)
    }
  }, [removeNotification])

  const setActionProgressNotification = useCallback((actionKey, message) => {
    const key = String(actionKey)
    const existingId = actionNotificationIdsRef.current.get(key)
    if (existingId) removeNotification(existingId)
    const notif = addNotification('pending', message, { autoHide: false, category: 'lab-action', priority: 'high', allowDuplicates: true })
    if (notif?.id) actionNotificationIdsRef.current.set(key, notif.id)
  }, [addNotification, removeNotification])

  const clearActionProgressNotification = useCallback((actionKey) => {
    const key = String(actionKey)
    const existingId = actionNotificationIdsRef.current.get(key)
    if (existingId) {
      removeNotification(existingId)
      actionNotificationIdsRef.current.delete(key)
    }
  }, [removeNotification])

  // Derived state
  const maxId = useMemo(() => Array.isArray(ownedLabs) && ownedLabs.length > 0 ? Math.max(...ownedLabs.map(lab => parseInt(lab.id) || 0).filter(id => !isNaN(id))) : 0, [ownedLabs])
  const selectedLab = useMemo(() => ownedLabs.find(lab => String(lab.id) === String(selectedLabId)), [ownedLabs, selectedLabId])
  const modalLab = useMemo(() => selectedLab ? selectedLab : (selectedLabId ? null : newLab), [selectedLab, selectedLabId, newLab])
  const shouldShowModal = Boolean(isModalOpen && modalLab)
  const labForModal = modalLab || newLab

  const formatErrorMessage = useCallback((error) => {
    let message = error?.message || 'Unknown error'
    const patterns = [
      { regex: /execution reverted:?\s*/i, replacement: '' },
      { regex: /VM Exception while processing transaction:?\s*/i, replacement: '' },
      { regex: /Error:\s*/i, replacement: '' }
    ]
    patterns.forEach(({ regex, replacement }) => { message = message.replace(regex, replacement) })
    return message.length > 80 ? message.substring(0, 77) + '...' : message
  }, [])

  // Handlers
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
      setCreateLabProgress(isSSO ? 'Sending lab to institution...' : 'Confirm the transaction...')

      const result = await addLabMutation.mutateAsync({
        ...labData,
        uri: onchainUri,
        providerId: providerOwnerAddress || address,
        isSSO,
        userEmail: user?.email,
        backendUrl: isSSO ? institutionBackendUrl : undefined,
        abortSignal: createLabAbortControllerRef.current?.signal,
      })

      const blockchainLabId = result?.labId?.toString?.() || result?.id?.toString?.()
      
      if (tempFiles.length > 0 && blockchainLabId) {
        setCreateLabProgress('📁 Moving uploaded files...')
        await moveFilesMutation.mutateAsync({ filePaths: tempFiles, labId: blockchainLabId })
      }

      setIsModalOpen(false)
      notifyLabCreated(addTemporaryNotification, blockchainLabId || labData?.id)
      clearCreateLabProgress()
    } catch (error) {
      notifyLabCreateFailed(addTemporaryNotification, formatErrorMessage(error))
      clearCreateLabProgress()
    } finally {
      setIsCreatingLab(false)
    }
  }, [addLabMutation, addTemporaryNotification, address, institutionBackendUrl, isSSO, maxId, moveFilesMutation, user, formatErrorMessage, setCreateLabProgress, clearCreateLabProgress])

  const handleCloseModal = useCallback(() => {
    if (isCreatingLab && isSSO && createLabAbortControllerRef.current) {
      createLabAbortControllerRef.current.abort()
      notifyLabCreateCancelled(addTemporaryNotification)
      clearCreateLabProgress()
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
      } catch (error) { 
        notifyLabInvalidPrice(addTemporaryNotification)
        return 
      }
    }

    if (labData.id) {
      await handleEditLab({ labData, originalPrice })
    } else {
      await handleAddLab({ labData })
    }
  }, [decimals, handleAddLab, addTemporaryNotification])

  async function handleEditLab({ labData, originalPrice }) {
    const originalLab = ownedLabs.find(lab => lab.id == labData.id)
    const providerSegmentSource = isSSO ? (user?.institutionName || user?.name) : user?.name
    const providerSegment = sanitizeProviderNameForUri(providerSegmentSource)
    labData.uri = labData.uri || originalLab?.uri || `Lab-${providerSegment}-${labData.id}.json`
    const onchainUri = resolveOnchainLabUri(labData.uri)

    const hasChangedOnChainData = 
      originalLab.uri !== onchainUri || 
      originalLab.price !== labData.price || 
      originalLab.accessURI !== labData.accessURI || 
      originalLab.accessKey !== labData.accessKey

    try {
      if (hasChangedOnChainData) {
        const actionKey = `update:${labData.id}`
        if (isSSO) setActionProgressNotification(actionKey, 'Updating lab...')
        else notifyLabUpdateStarted(addTemporaryNotification, labData.id)
        
        setOptimisticLabState(String(labData.id), { editing: true, isPending: true })

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
      }

      if (labData.uri.startsWith('Lab-')) {
        await saveLabDataMutation.mutateAsync({ ...labData, price: originalPrice })
        notifyLabMetadataUpdated(addTemporaryNotification, labData.id)
      }
    } catch (error) {
      notifyLabUpdateFailed(addTemporaryNotification, labData.id, formatErrorMessage(error))
      clearOptimisticLabState(String(labData.id))
    }
  }

  /**
   * UPDATED: Now passes the correct payload object for SSO to satisfy tests
   */
  const handleDeleteLab = useCallback(async (labId) => {
    const actionKey = `delete:${labId}`
    try {
      if (isSSO) setActionProgressNotification(actionKey, 'Deleting lab...')
      else notifyLabDeleteStarted(addTemporaryNotification, labId)
      
      setOptimisticLabState(String(labId), { deleting: true, isPending: true })
      
      // Payload logic for SSO vs Wallet
      const deletePayload = isSSO 
        ? { labId: String(labId), backendUrl: institutionBackendUrl } 
        : String(labId)

      await deleteLabMutation.mutateAsync(deletePayload)
      
      if (isSSO) clearActionProgressNotification(actionKey)
      notifyLabDeleted(addTemporaryNotification, labId)
      notifyLabDeletedCascadeWarning(addTemporaryNotification, labId)
      clearOptimisticLabState(String(labId))
      
      if (selectedLabId === String(labId)) setSelectedLabId("")
      
    } catch (error) {
      if (isSSO) clearActionProgressNotification(actionKey)
      clearOptimisticLabState(String(labId))
      notifyLabDeleteFailed(addTemporaryNotification, labId, formatErrorMessage(error))
    }
  }, [addTemporaryNotification, institutionBackendUrl, isSSO, deleteLabMutation, setActionProgressNotification, clearActionProgressNotification, setOptimisticLabState, clearOptimisticLabState, selectedLabId, formatErrorMessage])

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
      if (isSSO) clearListingProgressNotification(actionKey)
      clearOptimisticListingState(String(labId))
      notifyLabListFailed(addTemporaryNotification, labId, formatErrorMessage(error))
    }
  }, [addTemporaryNotification, institutionBackendUrl, isSSO, listLabMutation, setListingProgressNotification, clearListingProgressNotification, setOptimisticListingState, completeOptimisticListingState, clearOptimisticListingState, queryClient, formatErrorMessage])

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
      clearListingProgressNotification(labId)
      clearOptimisticListingState(String(labId))
      notifyLabUnlistFailed(addTemporaryNotification, labId, formatErrorMessage(error))
    }
  }, [addTemporaryNotification, institutionBackendUrl, isSSO, unlistLabMutation, setListingProgressNotification, clearListingProgressNotification, setOptimisticListingState, completeOptimisticListingState, clearOptimisticListingState, queryClient, formatErrorMessage])

  const handleCollectAll = useCallback(async () => {
    const actionKey = 'collect:all'
    try {
      if (isSSO) setActionProgressNotification(actionKey, 'Collecting balances...')
      else notifyLabCollectStarted(addTemporaryNotification)
      
      await requestFundsMutation.mutateAsync()
      
      if (isSSO) clearActionProgressNotification(actionKey)
      notifyLabCollected(addTemporaryNotification)
    } catch (err) {
      if (isSSO) clearActionProgressNotification(actionKey)
      notifyLabCollectFailed(addTemporaryNotification, formatErrorMessage(err))
    }
  }, [addTemporaryNotification, isSSO, requestFundsMutation, setActionProgressNotification, clearActionProgressNotification, formatErrorMessage])

  const handleSelectChange = useCallback((e) => { setSelectedLabId(e.target.value) }, [])

  useEffect(() => {
    if (ownedLabs.length > 0 && !selectedLabId && !isModalOpen) {
      const firstLabId = ownedLabs[0]?.id
      if (firstLabId) setSelectedLabId(String(firstLabId))
    }
  }, [ownedLabs.length, selectedLabId, isModalOpen])

  return {
    selectedLabId, setSelectedLabId, selectedLab, maxId,
    isModalOpen, setIsModalOpen, isCreatingLab, newLab, setNewLab,
    modalLab, shouldShowModal, labForModal,
    handleAddLab, handleSaveLab, handleDeleteLab, handleList, handleUnlist, handleCollectAll,
    handleSelectChange, handleCloseModal, formatErrorMessage
  }
}