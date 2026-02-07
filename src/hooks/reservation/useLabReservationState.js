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
import { bookingQueryKeys } from '@/utils/hooks/queryKeys'
import { contractABI, contractAddresses } from '@/contracts/diamond'
import { selectChain } from '@/utils/blockchain/selectChain'
import devLog from '@/utils/dev/logger'
import {
  notifyReservationOnChainRequested,
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

/**
 * Lab reservation state management hook
 * @param {Object} options
 * @param {Object|null} options.selectedLab - Currently selected lab
 * @param {Array} options.labBookings - Bookings for the selected lab
 * @param {boolean} options.isSSO - Whether user is using SSO
 * @returns {Object} State and handlers for reservation management
 */
export function useLabReservationState({ selectedLab, labBookings, isSSO }) {
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

  // Client-side hydration
  useEffect(() => {
    setIsClient(true)
  }, [])

  // Reset optimistic cleanup guard when a new pending reservation is set
  useEffect(() => {
    optimisticRemovedRef.current = false
  }, [pendingData?.optimisticId])

  // Register pending SSO reservations in BookingEventContext so centralized polling/events
  // can drive final toasts and status updates even when an on-chain event is missed locally.
  useEffect(() => {
    if (!isSSO || typeof registerPendingConfirmation !== 'function') return

    const rawKey = pendingData?.reservationKey || pendingData?.optimisticId
    if (!rawKey) return

    const key = String(rawKey).trim()
    const normalizedKey = key.startsWith('0x') ? key : `0x${key}`
    if (!/^0x[0-9a-f]{64}$/i.test(normalizedKey)) return

    registerPendingConfirmation(
      normalizedKey,
      pendingData?.labId,
      pendingData?.userAddress
    )
  }, [
    isSSO,
    pendingData?.reservationKey,
    pendingData?.optimisticId,
    pendingData?.labId,
    pendingData?.userAddress,
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

    notifyReservationOnChainRequested(addTemporaryNotification, reservationKey || pendingData?.reservationKey || pendingData?.optimisticId);

    setIsBooking(false);

    // Refresh token data for wallet users
    if (!isSSO) {
      refreshTokenData();

      const labId = pendingData?.labId;
      const userAddress = pendingData?.userAddress;

      if (labId !== undefined && labId !== null) {
        queryClient.invalidateQueries({ queryKey: bookingQueryKeys.getReservationsOfToken(labId) });
        queryClient.invalidateQueries({ queryKey: ['bookings', 'reservationOfToken', labId], exact: false });
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
    extractReservationRequested
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
      
      if (pendingData?.optimisticId && pendingData?.isOptimistic) {
        devLog.log('❌ Transaction error, removing optimistic booking:', pendingData.optimisticId)
        bookingCacheUpdates.removeOptimisticBooking(pendingData.optimisticId)
      }
      
      setLastTxHash(null)
      setPendingData(null)
    }
  }, [isReceiptError, receiptError, lastTxHash, addErrorNotification, pendingData, bookingCacheUpdates])

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
    totalCost,
    
    // Transaction state
    isWaitingForReceipt,
    isReceiptError,
    
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
    
    // Utilities
    formatPrice,
    
    // Mutations
    reservationRequestMutation,
    bookingCacheUpdates
  }
}
