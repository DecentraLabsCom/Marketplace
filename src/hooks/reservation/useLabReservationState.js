/**
 * Custom hook for lab reservation state management
 * Handles all state logic for the reservation flow
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useWaitForTransactionReceipt } from 'wagmi'
import { useNotifications } from '@/context/NotificationContext'
import { useLabToken } from '@/context/LabTokenContext'
import { 
  useReservationRequest, 
  useBookingCacheUpdates 
} from '@/hooks/booking/useBookings'
import { isCancelledBooking } from '@/utils/booking/bookingStatus'
import { generateTimeOptions } from '@/utils/booking/labBookingCalendar'
import devLog from '@/utils/dev/logger'

/**
 * Safe date parsing utility
 * @param {string|Date|number} value - Value to parse
 * @param {Date} fallback - Fallback date if parsing fails
 * @returns {Date} Parsed date or fallback
 */
const safeParseDate = (value, fallback = new Date()) => {
  if (!value) return fallback
  if (value instanceof Date && !isNaN(value)) return value
  
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
    if (isReceiptSuccess && receipt && lastTxHash) {
      addTemporaryNotification('success', '✅ Reservation request registered on-chain! Waiting for final confirmation...')
      
      setIsBooking(false)
      
      // Refresh token data for wallet users
      if (!isSSO) {
        refreshTokenData()
      }
      
      // Force UI refresh
      setForceRefresh(prev => prev + 1)
      
      // Reset transaction state
      setLastTxHash(null)

      devLog.log('✅ Reservation request registered on-chain - BookingEventContext will process the event')
    }
  }, [isReceiptSuccess, receipt, lastTxHash, addTemporaryNotification, isSSO, refreshTokenData])

  // Clean up optimistic booking when real booking appears
  useEffect(() => {
    if (!pendingData?.optimisticId) return
    
    const matchingRealBooking = labBookings.find(booking => {
      if (booking.isOptimistic) return false
      
      const bookingStart = parseInt(booking.start)
      const pendingStart = parseInt(pendingData.start)
      
      return booking.labId?.toString() === pendingData.labId?.toString() &&
             Math.abs(bookingStart - pendingStart) < 60
    })
    
    if (matchingRealBooking) {
      devLog.log('✅ Real booking found, removing optimistic booking:', {
        optimisticId: pendingData.optimisticId,
        realBookingKey: matchingRealBooking.reservationKey
      })
      
      bookingCacheUpdates.removeOptimisticBooking(pendingData.optimisticId)
      setPendingData(null)
      setForceRefresh(prev => prev + 1)
    }
  }, [labBookings, pendingData, bookingCacheUpdates])

  // Handle transaction errors
  useEffect(() => {
    if (isReceiptError && receiptError && lastTxHash) {    
      addErrorNotification(receiptError, 'Transaction')
      setIsBooking(false)
      
      if (pendingData?.optimisticId) {
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
