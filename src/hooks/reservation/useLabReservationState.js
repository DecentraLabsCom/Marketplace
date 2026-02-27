/**
 * Custom hook for lab reservation state management
 * Handles all state logic for the reservation flow
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useConnection, useWaitForTransactionReceipt } from 'wagmi'
import { decodeEventLog } from 'viem'
import { useNotifications } from '@/context/NotificationContext'
import { useOptionalBookingEventContext } from '@/context/BookingEventContext'
import { useLabToken } from '@/context/LabTokenContext'
import { 
  useReservationRequest, 
  useBookingCacheUpdates 
} from '@/hooks/booking/useBookings'
import { BOOKING_STATUS, isCancelledBooking } from '@/utils/booking/bookingStatus'
import { generateTimeOptions } from '@/utils/booking/labBookingCalendar'
import { normalizeReservationKey } from '@/utils/booking/reservationKey'
import { bookingQueryKeys } from '@/utils/hooks/queryKeys'
import { contractABI, contractAddresses } from '@/contracts/diamond'
import { selectChain } from '@/utils/blockchain/selectChain'
import { useSsoReservationFlow, SSO_BOOKING_STAGE } from './useSsoReservationFlow'
import { useWalletReservationFlow } from './useWalletReservationFlow'
import { useReservationButtonState } from './useReservationButtonState'
import devLog from '@/utils/dev/logger'
import {
  notifyReservationRequestAcceptedAwaitingOnChain,
  notifyReservationWalletAwaitingProviderConfirmation,
  notifyReservationTxReverted,
} from '@/utils/notifications/reservationToasts'

/**
 * Safe date parsing utility
 * @param {string|Date|number} value - Value to parse
 * @param {Date} fallback - Fallback date if parsing fails
 * @returns {Date} Parsed date or fallback
 */
const safeParseDate = (value, fallback = new Date()) => {
  if (value === undefined || value === null) return fallback
  if (value instanceof Date && !isNaN(value)) return value

  const numericValue = Number(value)
  if (Number.isFinite(numericValue) && numericValue > 0) {
    return new Date(numericValue * 1000)
  }
  
  try {
    const parsed = new Date(value)
    if (!isNaN(parsed.getTime())) return parsed
  } catch (e) {
    devLog.warn('Failed to parse date:', value, e)
  }
  
  return fallback
}

const toEpochSeconds = (value) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

const buildRequestMatchKey = (booking) => {
  const reservationKey = normalizeReservationKey(booking?.reservationKey || booking?.id)
  if (reservationKey) return `key:${reservationKey}`

  const labId = booking?.labId !== undefined && booking?.labId !== null
    ? String(booking.labId)
    : null
  const start = toEpochSeconds(booking?.start)
  if (labId && Number.isFinite(start)) return `slot:${labId}:${start}`

  return null
}

const findTrackedBookingForRequest = (bookings, activeRequest) => {
  if (!activeRequest || !Array.isArray(bookings) || bookings.length === 0) return null

  const normalizedRequestKey = normalizeReservationKey(activeRequest.reservationKey)
  const requestedLabId = String(activeRequest.labId)
  const requestedStart = toEpochSeconds(activeRequest.start)

  return bookings.find((booking) => {
    if (String(booking?.labId) !== requestedLabId) return false

    const bookingKey = normalizeReservationKey(booking?.reservationKey || booking?.id)
    if (normalizedRequestKey && bookingKey && bookingKey === normalizedRequestKey) return true

    const bookingStart = toEpochSeconds(booking?.start)
    if (!Number.isFinite(requestedStart) || !Number.isFinite(bookingStart)) return false

    return Math.abs(bookingStart - requestedStart) <= 60
  }) || null
}

const buildPendingCalendarBooking = (request) => {
  if (!request) return null

  const labId = request.labId !== undefined && request.labId !== null
    ? String(request.labId)
    : null
  const start = toEpochSeconds(request.start)
  const end = toEpochSeconds(request.end)
  if (!labId || !Number.isFinite(start)) return null

  const normalizedKey = normalizeReservationKey(request.reservationKey)
  const syntheticKey = normalizedKey || `pending-${labId}-${start}`

  return {
    id: syntheticKey,
    reservationKey: syntheticKey,
    labId,
    start,
    end: Number.isFinite(end) ? end : null,
    date: new Date(start * 1000).toLocaleDateString('en-CA'),
    status: BOOKING_STATUS.PENDING,
    statusCategory: 'pending',
    isPending: true,
    isOptimistic: true,
  }
}

/**
 * Lab reservation state management hook
 * @param {Object} options
 * @param {Object|null} options.selectedLab - Currently selected lab
 * @param {Array} options.labBookings - Bookings for the selected lab
 * @param {boolean} options.isSSO - Whether user is using SSO
 * @returns {Object} State and handlers for reservation management
 */
export function useLabReservationState({
  selectedLab,
  labBookings,
  userBookingsForLab = [],
  isSSO,
} = {}) {
  const { chain } = useConnection()
  const safeChain = selectChain(chain)
  const chainKey = safeChain?.name?.toLowerCase?.() || 'sepolia'
  const contractAddress = contractAddresses[chainKey]
  const { addTemporaryNotification, addErrorNotification } = useNotifications()
  const { registerPendingConfirmation } = useOptionalBookingEventContext()
  const { 
    calculateReservationCost, 
    formatPrice,
    refreshTokenData
  } = useLabToken()
  
  // Cache update hooks
  const bookingCacheUpdates = useBookingCacheUpdates()
  const queryClient = useQueryClient()
  
  // React Query mutation for booking creation
  const reservationRequestMutation = useReservationRequest()
  
  // State
  const [date, setDate] = useState(new Date())
  const [duration, setDuration] = useState(15)
  const [selectedTime, setSelectedTime] = useState('')
  const [isBooking, setIsBooking] = useState(false)
  const [forceRefresh, setForceRefresh] = useState(0)
  const [isClient, setIsClient] = useState(false)
  
  // Transaction state
  const [lastTxHash, setLastTxHash] = useState(null)
  const [pendingData, setPendingData] = useState(null)
  const optimisticRemovedRef = useRef(false)
  const fallbackSsoToastKeysRef = useRef(new Set())
  const onChainRequestedToastKeysRef = useRef(new Set())

  const extractReservationRequested = useCallback((receiptData) => {
    if (!receiptData?.logs || !Array.isArray(receiptData.logs)) return null

    for (const log of receiptData.logs) {
      try {
        if (contractAddress && log?.address && log.address.toLowerCase() !== contractAddress.toLowerCase()) {
          continue
        }

        const decoded = decodeEventLog({
          abi: contractABI,
          data: log.data,
          topics: log.topics
        })

        if (decoded?.eventName === 'ReservationRequested') {
          return decoded.args
        }
      } catch {
        // ignore non-matching logs
      }
    }

    return null
  }, [contractAddress])
  
  // Wait for transaction receipt
  const { 
    data: receipt, 
    isLoading: isWaitingForReceipt, 
    isSuccess: isReceiptSuccess,
    isError: isReceiptError,
    error: receiptError
  } = useWaitForTransactionReceipt({
    hash: lastTxHash,
    enabled: !!lastTxHash
  })

  const {
    ssoBookingStage,
    activeSsoRequest,
    isSSOFlowLocked,
    startSsoProcessing,
    markSsoRequestSent,
    resetSsoReservationFlow,
  } = useSsoReservationFlow({
    isSSO,
    userBookingsForLab,
    labBookings,
  })

  const {
    walletBookingStage,
    activeWalletRequest,
    isWalletFlowLocked,
    startWalletProcessing,
    markWalletRequestSent,
    resetWalletReservationFlow,
  } = useWalletReservationFlow({
    isWallet: !isSSO,
    userBookingsForLab,
    labBookings,
  })

  // Client-side hydration
  useEffect(() => {
    setIsClient(true)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const handleOnChainRequested = (event) => {
      const reservationKey = normalizeReservationKey(event?.detail?.reservationKey)
      if (!reservationKey) return
      onChainRequestedToastKeysRef.current.add(reservationKey)
    }

    window.addEventListener('reservation-requested-onchain', handleOnChainRequested)
    return () => window.removeEventListener('reservation-requested-onchain', handleOnChainRequested)
  }, [])

  // Reset optimistic cleanup guard when a new pending reservation is set
  useEffect(() => {
    optimisticRemovedRef.current = false
  }, [pendingData?.optimisticId])

  // Register pending reservations in BookingEventContext so centralized polling/events
  // can drive final toasts and status updates even when an on-chain event is missed locally.
  useEffect(() => {
    if (typeof registerPendingConfirmation !== 'function') return

    const candidateReservationKey = pendingData?.reservationKey || pendingData?.optimisticId

    const normalizedKey = normalizeReservationKey(
      candidateReservationKey
    )
    if (!normalizedKey) return

    registerPendingConfirmation(
      normalizedKey,
      pendingData?.labId,
      pendingData?.userAddress,
      {
        start: pendingData?.start,
        end: pendingData?.end,
      }
    )
  }, [
    pendingData?.reservationKey,
    pendingData?.optimisticId,
    pendingData?.labId,
    pendingData?.userAddress,
    pendingData?.start,
    pendingData?.end,
    registerPendingConfirmation
  ])

  // Update the duration when the selected lab changes
  useEffect(() => {
    if (selectedLab && Array.isArray(selectedLab.timeSlots) && selectedLab.timeSlots.length > 0) {
      setDuration(selectedLab.timeSlots[0])
    }
  }, [selectedLab])

  // Update calendar date to lab opening date if it's in the future
  useEffect(() => {
    if (selectedLab && selectedLab.opens) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const opensDate = safeParseDate(selectedLab.opens, today)
      
      if (opensDate > today) {
        setDate(opensDate)
      }
    }
  }, [selectedLab])

  // Calculate calendar dates
  const { minDate, maxDate } = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const opensDate = selectedLab ? safeParseDate(selectedLab.opens, today) : today
    const min = opensDate > today ? opensDate : today
    const max = selectedLab ? safeParseDate(selectedLab.closes) : undefined
    
    return { minDate: min, maxDate: max }
  }, [selectedLab])

  // Calculate available times
  const availableTimes = useMemo(() => {
    if (!selectedLab) return []
    
    return generateTimeOptions({
      date,
      interval: duration,
      lab: selectedLab,
      bookingInfo: (labBookings || []).filter(booking => 
        !isCancelledBooking(booking)
      )
    })
  }, [selectedLab, date, duration, labBookings])

  const calendarUserBookingsForLab = useMemo(() => {
    const baseUserBookings = Array.isArray(userBookingsForLab) ? userBookingsForLab : []
    const combinedBookings = [
      ...baseUserBookings,
      ...(Array.isArray(labBookings) ? labBookings : []),
    ]

    let trackedBooking = null
    let syntheticBooking = null

    if (isSSO && ssoBookingStage === SSO_BOOKING_STAGE.REQUEST_REGISTERED) {
      trackedBooking = findTrackedBookingForRequest(combinedBookings, activeSsoRequest)
      syntheticBooking = buildPendingCalendarBooking(activeSsoRequest)
    } else if (!isSSO && walletBookingStage === SSO_BOOKING_STAGE.REQUEST_REGISTERED) {
      trackedBooking = findTrackedBookingForRequest(combinedBookings, activeWalletRequest)
      syntheticBooking = buildPendingCalendarBooking(activeWalletRequest)
    }

    const merged = [...baseUserBookings]
    if (trackedBooking) {
      merged.push(trackedBooking)
    } else if (syntheticBooking) {
      merged.push(syntheticBooking)
    }

    const deduped = new Map()
    merged.forEach((booking) => {
      const dedupeKey = buildRequestMatchKey(booking)
      if (!dedupeKey) {
        deduped.set(`fallback-${deduped.size}`, booking)
        return
      }

      const existing = deduped.get(dedupeKey)
      if (!existing || existing?.isOptimistic) {
        deduped.set(dedupeKey, booking)
      }
    })

    return Array.from(deduped.values())
  }, [
    userBookingsForLab,
    labBookings,
    isSSO,
    ssoBookingStage,
    walletBookingStage,
    activeSsoRequest,
    activeWalletRequest,
  ])

  // Calculate total cost
  const totalCost = useMemo(() => 
    selectedLab ? calculateReservationCost(selectedLab.price, duration) : 0n,
    [selectedLab, duration, calculateReservationCost]
  )

  // Select the first available time when the available times change
  useEffect(() => {
    if (!selectedLab) return
    
    const firstAvailable = availableTimes.find(t => !t.disabled)
    const newSelectedTime = firstAvailable ? firstAvailable.value : ''
    
    // Only update if the current selection is no longer available
    if (selectedTime && !availableTimes.find(t => t.value === selectedTime && !t.disabled)) {
      setSelectedTime(newSelectedTime)
    } else if (!selectedTime) {
      setSelectedTime(newSelectedTime)
    }
  }, [date, duration, selectedLab, labBookings?.length, selectedTime, availableTimes])

  // Force refresh of selected time when forceRefresh changes
  useEffect(() => {
    if (!selectedLab || forceRefresh === 0) return
    
    // Revalidate current selection
    const currentlySelected = availableTimes.find(t => t.value === selectedTime)
    if (!currentlySelected || currentlySelected.disabled) {
      const firstAvailable = availableTimes.find(t => !t.disabled)
      setSelectedTime(firstAvailable ? firstAvailable.value : '')
    }
  }, [forceRefresh, selectedLab, availableTimes, selectedTime])

  // Handle transaction confirmation
  useEffect(() => {
    if (!lastTxHash || !receipt || !isReceiptSuccess) return;

    const receiptStatus = receipt?.status;
    const isTxSuccessful = receiptStatus === 'success' || receiptStatus === 1 || receiptStatus === '0x1';

    if (!isTxSuccessful) {
      notifyReservationTxReverted(addTemporaryNotification);
      setIsBooking(false);
      if (!isSSO) {
        resetWalletReservationFlow();
      }

      if (pendingData?.optimisticId && pendingData?.isOptimistic) {
        bookingCacheUpdates.removeOptimisticBooking(pendingData.optimisticId);
      }

      setPendingData(null);
      setLastTxHash(null);
      return;
    }

    // Try to extract reservation key from the tx logs so we can track the real request
    const requested = extractReservationRequested(receipt);
    const reservationKey =
      requested?.reservationKey?.toString?.() ||
      requested?.reservationKey ||
      null;

    if (reservationKey && pendingData?.optimisticId && pendingData?.isOptimistic) {
      try {
        bookingCacheUpdates.replaceOptimisticBooking(pendingData.optimisticId, {
          ...pendingData,
          id: reservationKey,
          reservationKey,
          status: 'pending',
          statusCategory: 'pending',
          isPending: true,
          isOptimistic: true,
          transactionHash: lastTxHash
        });
      } catch (err) {
        devLog.warn('Failed to replace optimistic booking with reservation key:', err);
      }

      setPendingData(prev => prev ? { ...prev, optimisticId: reservationKey, reservationKey } : prev);
    }

    setIsBooking(false);

    if (!isSSO) {
      markWalletRequestSent({
        reservationKey: reservationKey || pendingData?.reservationKey || pendingData?.optimisticId || null,
        labId: pendingData?.labId,
        start: pendingData?.start,
        end: pendingData?.end,
      });
    }

    // Refresh token data for wallet users
    if (!isSSO) {
      refreshTokenData();

      const labId = pendingData?.labId;
      const userAddress = pendingData?.userAddress;

      if (labId !== undefined && labId !== null) {
        queryClient.invalidateQueries({ queryKey: bookingQueryKeys.getReservationsOfToken(labId) });
        queryClient.invalidateQueries({
          queryKey: bookingQueryKeys.reservationOfTokenPrefix(labId),
          exact: false,
        });
      }

      if (userAddress) {
        queryClient.invalidateQueries({ queryKey: bookingQueryKeys.reservationsOf(userAddress) });
      }
    }

    // Force UI refresh
    setForceRefresh(prev => prev + 1);

    // Reset transaction state
    setLastTxHash(null);

    devLog.log('✅ Reservation request registered on-chain - BookingEventContext will process the event', {
      reservationKey
    });
  }, [
    isReceiptSuccess,
    receipt,
    lastTxHash,
    addTemporaryNotification,
    isSSO,
    refreshTokenData,
    pendingData,
    bookingCacheUpdates,
    queryClient,
    extractReservationRequested,
    resetWalletReservationFlow,
    markWalletRequestSent,
  ])

  // Clean up optimistic booking when real booking appears
  useEffect(() => {
    if (!pendingData?.optimisticId || !Array.isArray(labBookings)) return
    
    const matchingRealBooking = labBookings.find(booking => {
      if (booking.isOptimistic) return false
      
      const bookingStart = parseInt(booking.start)
      const pendingStart = parseInt(pendingData.start)
      
      return booking.labId?.toString() === pendingData.labId?.toString() &&
             Math.abs(bookingStart - pendingStart) < 60
    })
    
    if (!matchingRealBooking) return

    devLog.log('✅ Real booking found, evaluating optimistic cleanup:', {
      optimisticId: pendingData.optimisticId,
      realBookingKey: matchingRealBooking.reservationKey,
      status: matchingRealBooking.status
    })

    if (pendingData?.isOptimistic && !optimisticRemovedRef.current) {
      bookingCacheUpdates.removeOptimisticBooking(pendingData.optimisticId)
      optimisticRemovedRef.current = true
      setForceRefresh(prev => prev + 1)
    }

    // Wallet flow relies on BookingEventContext for confirmations
    if (!isSSO) {
      setPendingData(null)
      return
    }

    const statusNumber = Number(matchingRealBooking.status)
    if (!Number.isFinite(statusNumber)) return

    if (statusNumber === BOOKING_STATUS.CANCELLED) {
      setPendingData(null)
      setForceRefresh(prev => prev + 1)
      return
    }

    if (statusNumber > BOOKING_STATUS.PENDING) {
      setPendingData(null)
      setForceRefresh(prev => prev + 1)
    }
  }, [labBookings, pendingData, bookingCacheUpdates, isSSO])

  // Handle transaction errors
  useEffect(() => {
    if (isReceiptError && receiptError && lastTxHash) {    
      addErrorNotification(receiptError, 'Transaction')
      setIsBooking(false)
      if (!isSSO) {
        resetWalletReservationFlow()
      }
      
      if (pendingData?.optimisticId && pendingData?.isOptimistic) {
        devLog.log('❌ Transaction error, removing optimistic booking:', pendingData.optimisticId)
        bookingCacheUpdates.removeOptimisticBooking(pendingData.optimisticId)
      }
      
      setLastTxHash(null)
      setPendingData(null)
    }
  }, [
    isReceiptError,
    receiptError,
    lastTxHash,
    addErrorNotification,
    pendingData,
    bookingCacheUpdates,
    isSSO,
    resetWalletReservationFlow,
  ])

  useEffect(() => {
    if (!isSSO || ssoBookingStage !== SSO_BOOKING_STAGE.REQUEST_REGISTERED) return

    const normalizedReservationKey = normalizeReservationKey(
      activeSsoRequest?.reservationKey || pendingData?.reservationKey || pendingData?.optimisticId
    )
    if (!normalizedReservationKey) return
    if (fallbackSsoToastKeysRef.current.has(normalizedReservationKey)) return

    const timer = setTimeout(() => {
      if (onChainRequestedToastKeysRef.current.has(normalizedReservationKey)) return

      notifyReservationRequestAcceptedAwaitingOnChain(
        addTemporaryNotification,
        normalizedReservationKey
      )
      fallbackSsoToastKeysRef.current.add(normalizedReservationKey)
    }, 1200)

    return () => clearTimeout(timer)
  }, [
    isSSO,
    ssoBookingStage,
    activeSsoRequest?.reservationKey,
    pendingData?.reservationKey,
    pendingData?.optimisticId,
    addTemporaryNotification,
  ])

  // Wallet equivalent: booking is on-chain (receipt confirmed), awaiting provider confirmation
  useEffect(() => {
    if (isSSO || walletBookingStage !== SSO_BOOKING_STAGE.REQUEST_REGISTERED) return

    const normalizedReservationKey = normalizeReservationKey(
      activeWalletRequest?.reservationKey || pendingData?.reservationKey || pendingData?.optimisticId
    )
    if (!normalizedReservationKey) return
    if (fallbackSsoToastKeysRef.current.has(normalizedReservationKey)) return

    const timer = setTimeout(() => {
      if (onChainRequestedToastKeysRef.current.has(normalizedReservationKey)) return

      notifyReservationWalletAwaitingProviderConfirmation(
        addTemporaryNotification,
        normalizedReservationKey
      )
      fallbackSsoToastKeysRef.current.add(normalizedReservationKey)
    }, 1200)

    return () => clearTimeout(timer)
  }, [
    isSSO,
    walletBookingStage,
    activeWalletRequest?.reservationKey,
    pendingData?.reservationKey,
    pendingData?.optimisticId,
    addTemporaryNotification,
  ])

  // Handlers
  const handleDateChange = useCallback((newDate) => {
    setDate(newDate)
  }, [])

  const handleDurationChange = useCallback((newDuration) => {
    setDuration(newDuration)
  }, [])

  const handleTimeChange = useCallback((newTime) => {
    setSelectedTime(newTime)
  }, [])

  const handleBookingSuccess = useCallback(() => {
    setForceRefresh(prev => prev + 1)
    setIsBooking(false)
    devLog.log('✅ Booking success - relying on BookingEventContext for cache updates')
  }, [])

  const reservationButtonState = useReservationButtonState({
    isSSO,
    selectedTime,
    isBooking,
    isWaitingForReceipt,
    isReceiptError,
    ssoBookingStage,
    isSSOFlowLocked,
    walletBookingStage,
    isWalletFlowLocked,
  })

  return {
    // State
    date,
    duration,
    selectedTime,
    isBooking,
    forceRefresh,
    isClient,
    minDate,
    maxDate,
    availableTimes,
    calendarUserBookingsForLab,
    totalCost,
    
    // Transaction state
    isWaitingForReceipt,
    isReceiptError,
    ssoBookingStage,
    isSSOFlowLocked,
    walletBookingStage,
    isWalletFlowLocked,
    reservationButtonState,
    
    // Setters
    setIsBooking,
    setLastTxHash,
    setPendingData,
    setForceRefresh,
    
    // Handlers
    handleDateChange,
    handleDurationChange,
    handleTimeChange,
    handleBookingSuccess,
    startSsoProcessing,
    markSsoRequestSent,
    resetSsoReservationFlow,
    startWalletProcessing,
    markWalletRequestSent,
    resetWalletReservationFlow,
    
    // Utilities
    formatPrice,
    
    // Mutations
    reservationRequestMutation,
    bookingCacheUpdates
  }
}
