/**
 * Custom hook for lab reservation state management
 * Handles all state logic for the reservation flow
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useWaitForTransactionReceipt } from 'wagmi'
import { useNotifications } from '@/context/NotificationContext'
import { useLabToken } from '@/context/LabTokenContext'
import { 
  useReservationRequest, 
  useBookingCacheUpdates 
} from '@/hooks/booking/useBookings'
import { BOOKING_STATUS, isCancelledBooking } from '@/utils/booking/bookingStatus'
import { generateTimeOptions } from '@/utils/booking/labBookingCalendar'
import { bookingQueryKeys } from '@/utils/hooks/queryKeys'
import devLog from '@/utils/dev/logger'

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
  const { addTemporaryNotification, addErrorNotification } = useNotifications()
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
  const successNotifiedRef = useRef(false)
  const optimisticRemovedRef = useRef(false)
  
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

  // Reset success notification guard when a new pending reservation is set
  useEffect(() => {
    successNotifiedRef.current = false
    optimisticRemovedRef.current = false
  }, [pendingData?.optimisticId])

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
      addTemporaryNotification('error', '❌ Transaction reverted. Reservation was not created.');
      setIsBooking(false);

      if (pendingData?.optimisticId && pendingData?.isOptimistic) {
        bookingCacheUpdates.removeOptimisticBooking(pendingData.optimisticId);
      }

      setPendingData(null);
      setLastTxHash(null);
      return;
    }

    addTemporaryNotification('success', '✅ Reservation request registered on-chain! Waiting for final confirmation...');

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

    devLog.log('✅ Reservation request registered on-chain - BookingEventContext will process the event');
  }, [
    isReceiptSuccess,
    receipt,
    lastTxHash,
    addTemporaryNotification,
    isSSO,
    refreshTokenData,
    pendingData,
    bookingCacheUpdates,
    queryClient
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
      if (!successNotifiedRef.current) {
        addTemporaryNotification('error', '❌ Reservation request denied by the institution.')
        successNotifiedRef.current = true
      }
      setPendingData(null)
      setForceRefresh(prev => prev + 1)
      return
    }

    if (statusNumber > BOOKING_STATUS.PENDING) {
      if (!successNotifiedRef.current) {
        addTemporaryNotification('success', '✅ Reservation confirmed!')
        successNotifiedRef.current = true
      }
      setPendingData(null)
      setForceRefresh(prev => prev + 1)
    }
  }, [labBookings, pendingData, bookingCacheUpdates, isSSO, addTemporaryNotification])

  // Fallback polling for SSO reservation status (avoids reliance on on-chain events)
  useEffect(() => {
    const normalizeHex = (value) => {
      if (!value) return null;
      const raw = String(value).trim().toLowerCase();
      return raw.startsWith('0x') ? raw.slice(2) : raw;
    };

    const rawKey = pendingData?.optimisticId;
    const normalized = normalizeHex(rawKey);
    const isValidReservationKey = normalized && /^[0-9a-f]{64}$/i.test(normalized);

    if (!isClient || !isValidReservationKey) return;

    let cancelled = false;
    const startedAt = Date.now();
    const reservationKey = normalized.startsWith('0x') ? normalized : `0x${normalized}`;
    const optimisticId = rawKey;

    const poll = async () => {
      if (cancelled) return;
      try {
        const response = await fetch(
          `/api/contract/reservation/getReservation?reservationKey=${encodeURIComponent(reservationKey)}`
        );
        if (response.ok) {
          const data = await response.json();
          const statusNumber = Number(data?.reservation?.status);
          if (Number.isFinite(statusNumber) && statusNumber !== 0) {
            setIsBooking(false);
            if (optimisticId && pendingData?.isOptimistic) {
              bookingCacheUpdates.removeOptimisticBooking(optimisticId);
            }
            setPendingData(null);
            setForceRefresh(prev => prev + 1);
            const labId = pendingData?.labId;
            if (labId !== undefined && labId !== null) {
            queryClient.invalidateQueries({ queryKey: bookingQueryKeys.getReservationsOfToken(labId) });
            queryClient.invalidateQueries({ queryKey: ['bookings', 'reservationOfToken', labId], exact: false });
          }
            queryClient.invalidateQueries({ queryKey: bookingQueryKeys.byReservationKey(reservationKey) });
            queryClient.invalidateQueries({ queryKey: bookingQueryKeys.ssoReservationsOf() });
            if (statusNumber === BOOKING_STATUS.CANCELLED) {
              addTemporaryNotification('error', '❌ Reservation request denied by the institution.');
            } else if (!successNotifiedRef.current && statusNumber > BOOKING_STATUS.PENDING) {
              addTemporaryNotification('success', '✅ Reservation confirmed!');
              successNotifiedRef.current = true
            }
            return;
          }
        }
      } catch {
        // ignore and retry
      }

      if (Date.now() - startedAt > 120000) {
        return;
      }

      setTimeout(poll, 8000);
    };

    poll();
    return () => {
      cancelled = true;
    };
  }, [isClient, pendingData, bookingCacheUpdates, addTemporaryNotification, setForceRefresh, queryClient])

  // Handle reservation denied events from BookingEventContext
  useEffect(() => {
    if (!isClient) return;

    const handleDenied = (event) => {
      const detail = event?.detail || {};
      const reservationKey = detail?.reservationKey;
      const tokenId = detail?.tokenId;
      const notified = detail?.notified;

      const normalizeHex = (value) => {
        if (!value) return null;
        const raw = String(value).trim().toLowerCase();
        return raw.startsWith('0x') ? raw.slice(2) : raw;
      };

      const normalizedReservationKey = normalizeHex(reservationKey);
      const normalizedPendingKey = normalizeHex(pendingData?.optimisticId);
      const tokenIdStr = tokenId?.toString?.() ?? tokenId;
      const pendingLabId = pendingData?.labId?.toString?.() ?? pendingData?.labId;
      const selectedLabId = selectedLab?.id?.toString?.() ?? selectedLab?.id;

      const matchesReservationKey =
        normalizedReservationKey &&
        normalizedPendingKey &&
        normalizedReservationKey === normalizedPendingKey;
      const matchesLabId =
        tokenIdStr && (pendingLabId || selectedLabId) &&
        String(tokenIdStr) === String(pendingLabId || selectedLabId);

      if (!matchesReservationKey && !matchesLabId && !notified) return;

      setIsBooking(false);

      if (pendingData?.optimisticId && pendingData?.isOptimistic) {
        bookingCacheUpdates.removeOptimisticBooking(pendingData.optimisticId);
      }

      setPendingData(null);
      setForceRefresh(prev => prev + 1);
      const targetLabId = tokenId ?? pendingData?.labId;
      if (targetLabId !== undefined && targetLabId !== null) {
        queryClient.invalidateQueries({ queryKey: bookingQueryKeys.getReservationsOfToken(targetLabId) });
        queryClient.invalidateQueries({ queryKey: ['bookings', 'reservationOfToken', targetLabId], exact: false });
      }
      if (reservationKey) {
        queryClient.invalidateQueries({ queryKey: bookingQueryKeys.byReservationKey(reservationKey) });
      }
      queryClient.invalidateQueries({ queryKey: bookingQueryKeys.ssoReservationsOf() });

      if (!notified) {
        addTemporaryNotification('error', '❌ Reservation request denied by the institution.');
      }
    };

    window.addEventListener('reservation-request-denied', handleDenied);
    return () => window.removeEventListener('reservation-request-denied', handleDenied);
  }, [isClient, pendingData, bookingCacheUpdates, addTemporaryNotification, setForceRefresh, selectedLab, queryClient])

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
