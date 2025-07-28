/**
 * Hook for managing booking creation workflow
 * Handles balance checking, token approval, and reservation creation
 */
import { useState, useCallback, useEffect } from 'react'
import { useWaitForTransactionReceipt } from 'wagmi'
import { useLabToken } from '@/hooks/useLabToken'
import { useCacheInvalidation } from '@/hooks/user/useUsers'
import useContractWriteFunction from '@/hooks/contract/useContractWriteFunction'
import { useNotifications } from '@/context/NotificationContext'
import devLog from '@/utils/dev/logger'

/**
 * Custom hook for booking creation workflow
 * @param {Object} selectedLab - Currently selected lab object
 * @param {Function} onBookingSuccess - Callback for successful booking
 * @returns {Object} Booking creation state and handlers
 */
export function useBookingCreation(selectedLab, onBookingSuccess) {
  const { addTemporaryNotification, addErrorNotification } = useNotifications()
  const cacheInvalidation = useCacheInvalidation()

  // Booking state
  const [isBooking, setIsBooking] = useState(false)
  const [lastTxHash, setLastTxHash] = useState(null)
  const [txType, setTxType] = useState(null) // 'reservation', 'approval'
  const [pendingData, setPendingData] = useState(null)

  // Lab token utilities
  const { 
    calculateReservationCost, 
    checkBalanceAndAllowance, 
    approveLabTokens, 
    formatTokenAmount: formatBalance,
    formatPrice,
    refreshTokenData
  } = useLabToken()

  // Contract write function
  const { contractWriteFunction: reservationRequest } = useContractWriteFunction('reservationRequest')

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

  /**
   * Calculate booking cost
   * @param {Date} date - Selected date
   * @param {number} timeMinutes - Duration in minutes
   * @returns {string} Formatted cost string
   */
  const calculateBookingCost = useCallback((date, timeMinutes) => {
    if (!selectedLab || !date || !timeMinutes) return "0"
    
    return calculateReservationCost(
      selectedLab.price,
      timeMinutes,
      selectedLab.decimals || 18
    )
  }, [selectedLab, calculateReservationCost])

  /**
   * Check if user has sufficient balance and allowance
   * @param {string} cost - Required cost amount
   * @returns {Promise<{hasBalance: boolean, hasAllowance: boolean, balance: string, allowance: string}>}
   */
  const checkUserBalance = useCallback(async (cost) => {
    if (!cost) return { hasBalance: false, hasAllowance: false, balance: "0", allowance: "0" }
    
    try {
      const result = await checkBalanceAndAllowance(cost)
      devLog.log('💰 Balance check result:', result)
      return result
    } catch (error) {
      devLog.error('❌ Error checking balance:', error)
      addErrorNotification('Failed to check token balance. Please try again.')
      return { hasBalance: false, hasAllowance: false, balance: "0", allowance: "0" }
    }
  }, [checkBalanceAndAllowance, addErrorNotification])

  /**
   * Approve LAB tokens for spending
   * @param {string} amount - Amount to approve
   * @returns {Promise<boolean>} Success status
   */
  const approveTokens = useCallback(async (amount) => {
    if (!amount) return false

    try {
      setIsBooking(true)
      setTxType('approval')
      
      addTemporaryNotification('Requesting token approval...', 'info', 5000)
      
      const txHash = await approveLabTokens(amount)
      setLastTxHash(txHash)
      
      devLog.log('✅ Approval transaction sent:', txHash)
      return true
    } catch (error) {
      devLog.error('❌ Token approval failed:', error)
      addErrorNotification('Token approval failed. Please try again.')
      setIsBooking(false)
      setTxType(null)
      return false
    }
  }, [approveLabTokens, addTemporaryNotification, addErrorNotification])

  /**
   * Create a reservation
   * @param {Object} bookingData - Booking parameters
   * @param {string} bookingData.labId - Lab ID
   * @param {number} bookingData.startTime - Start timestamp
   * @param {number} bookingData.endTime - End timestamp
   * @param {string} bookingData.userAddress - User wallet address
   * @returns {Promise<boolean>} Success status
   */
  const createReservation = useCallback(async (bookingData) => {
    if (!bookingData || !selectedLab) return false

    try {
      setIsBooking(true)
      setTxType('reservation')
      setPendingData(bookingData)
      
      addTemporaryNotification('Creating reservation...', 'info', 5000)
      
      const txHash = await reservationRequest({
        labId: bookingData.labId,
        start: bookingData.startTime,
        end: bookingData.endTime
      })
      
      setLastTxHash(txHash)
      
      devLog.log('✅ Reservation transaction sent:', txHash)
      return true
    } catch (error) {
      devLog.error('❌ Reservation creation failed:', error)
      addErrorNotification('Reservation creation failed. Please try again.')
      setIsBooking(false)
      setTxType(null)
      setPendingData(null)
      return false
    }
  }, [selectedLab, reservationRequest, addTemporaryNotification, addErrorNotification])

  /**
   * Complete booking workflow
   * @param {Object} bookingParams - Complete booking parameters
   * @returns {Promise<boolean>} Success status
   */
  const createBooking = useCallback(async (bookingParams) => {
    const { date, timeMinutes, userAddress, selectedTime } = bookingParams
    
    if (!selectedLab || !date || !timeMinutes || !userAddress) {
      addErrorNotification('Missing required booking information.')
      return false
    }

    try {
      // Calculate cost
      const cost = calculateBookingCost(date, timeMinutes)
      if (!cost || cost === "0") {
        addErrorNotification('Unable to calculate booking cost.')
        return false
      }

      // Check balance and allowance
      const { hasBalance, hasAllowance } = await checkUserBalance(cost)
      
      if (!hasBalance) {
        addErrorNotification('Insufficient LAB token balance.')
        return false
      }

      // Approve tokens if needed
      if (!hasAllowance) {
        const approvalSuccess = await approveTokens(cost)
        if (!approvalSuccess) return false
        // Transaction will be handled by receipt watcher
        return true
      }

      // Create reservation directly if already approved
      const startTime = Math.floor(new Date(`${date.toDateString()} ${selectedTime}`).getTime() / 1000)
      const endTime = startTime + (timeMinutes * 60)

      const bookingData = {
        labId: selectedLab.id,
        startTime,
        endTime,
        userAddress
      }

      return await createReservation(bookingData)
    } catch (error) {
      devLog.error('❌ Booking creation workflow failed:', error)
      addErrorNotification('Booking creation failed. Please try again.')
      return false
    }
  }, [selectedLab, calculateBookingCost, checkUserBalance, approveTokens, createReservation, addErrorNotification])

  /**
   * Reset booking state
   */
  const resetBookingState = useCallback(() => {
    setIsBooking(false)
    setLastTxHash(null)
    setTxType(null)
    setPendingData(null)
  }, [])

  // Handle transaction completion
  useEffect(() => {
    if (isReceiptSuccess && receipt && txType) {
      devLog.log('✅ Transaction completed:', { txType, receipt })
      
      if (txType === 'approval' && pendingData) {
        // After approval, create the reservation
        const { labId, startTime, endTime, userAddress } = pendingData
        createReservation({ labId, startTime, endTime, userAddress })
      } else if (txType === 'reservation') {
        // Booking completed successfully
        addTemporaryNotification('Reservation created successfully!', 'success', 5000)
        
        // Invalidate caches
        cacheInvalidation.invalidateUserBookings()
        cacheInvalidation.invalidateLabBookings(selectedLab?.id)
        
        // Refresh token data
        refreshTokenData()
        
        // Call success callback
        if (onBookingSuccess) {
          onBookingSuccess(receipt)
        }
        
        resetBookingState()
      }
    } else if (isReceiptError && receiptError) {
      devLog.error('❌ Transaction failed:', receiptError)
      addErrorNotification('Transaction failed. Please try again.')
      resetBookingState()
    }
  }, [isReceiptSuccess, isReceiptError, receipt, receiptError, txType, pendingData, createReservation, addTemporaryNotification, addErrorNotification, cacheInvalidation, selectedLab, refreshTokenData, onBookingSuccess, resetBookingState])

  return {
    // State
    isBooking,
    isWaitingForReceipt,
    txType,
    lastTxHash,
    
    // Actions
    createBooking,
    calculateBookingCost,
    checkUserBalance,
    resetBookingState,
    
    // Utilities
    formatBalance,
    formatPrice
  }
}
