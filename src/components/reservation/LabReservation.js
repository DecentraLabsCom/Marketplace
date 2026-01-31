/**
 * Main lab reservation component - REFACTORED VERSION
 * Orchestrates the booking creation flow using extracted components and hooks
 */
"use client"
import React, { useState, useMemo, useEffect } from 'react'
import PropTypes from 'prop-types'
import { useAccount } from 'wagmi'
import { Container } from '@/components/ui'
import { useUser } from '@/context/UserContext'
import { useNotifications } from '@/context/NotificationContext'
import { useLabsForReservation } from '@/hooks/lab/useLabs'
import { useLabBookingsDashboard } from '@/hooks/booking/useBookings'
import { useLabToken } from '@/context/LabTokenContext'
import { useLabReservationState } from '@/hooks/reservation/useLabReservationState'
import { isCancelledBooking } from '@/utils/booking/bookingStatus'
import { generateTimeOptions } from '@/utils/booking/labBookingCalendar'
import AccessControl from '@/components/auth/AccessControl'
import LabDetailsPanel from '@/components/reservation/LabDetailsPanel'
import { contractAddresses } from '@/contracts/diamond'
import devLog from '@/utils/dev/logger'

/**
 * Main lab reservation component that handles booking creation and management
 * @param {Object} props
 * @param {string|number} [props.id] - Lab ID to display reservation interface for
 * @returns {JSX.Element} Complete lab reservation interface
 */
export default function LabReservation({ id }) {
  const labId = id ? String(id) : null;
  
  // Data fetching
  const { data: labsData, isError: labsError } = useLabsForReservation()
  const labs = labsData.labs || []
  
  // User context
  const { isSSO, address: userAddress, institutionBackendUrl } = useUser()
  const { addTemporaryNotification, addErrorNotification } = useNotifications()
  const { chain, isConnected, address } = useAccount()
  
  // Local state
  const [selectedLab, setSelectedLab] = useState(null)
  
  // Auto-select lab when labId is provided from URL
  useEffect(() => {
    devLog.log('🔍 [LabReservation] useEffect triggered:', { labId, labsCount: labs.length, selectedLab: selectedLab?.id })
    
    if (labId && labs.length > 0 && !selectedLab) {
      const lab = labs.find((lab) => String(lab.id) === labId)
      if (lab) {
        devLog.log('🎯 [LabReservation] Auto-selecting lab from URL:', { labId, labName: lab.name })
        setSelectedLab(lab)
      } else {
        devLog.warn('⚠️ [LabReservation] Lab not found for ID:', labId, 'Available labs:', labs.map(l => l.id))
      }
    }
  }, [labId, labs, selectedLab])
  
  // Lab bookings data
  const { data: labBookingsData } = useLabBookingsDashboard(selectedLab?.id, {
    queryOptions: { enabled: !!selectedLab?.id }
  })
  const labBookings = useMemo(() => 
    labBookingsData?.bookings || [], 
    [labBookingsData]
  )
  
  // Lab reservation state hook (extracted logic)
  const {
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
    isWaitingForReceipt,
    isReceiptError,
    setIsBooking,
    setLastTxHash,
    setPendingData,
    handleDateChange,
    handleDurationChange,
    handleTimeChange,
    handleBookingSuccess,
    formatPrice,
    reservationRequestMutation,
    bookingCacheUpdates
  } = useLabReservationState({ selectedLab, labBookings, isSSO })
  
  // Lab token utilities
  const { 
    checkBalanceAndAllowance, 
    approveLabTokens, 
    formatTokenAmount: formatBalance
  } = useLabToken()
  
  // Handle lab selection
  const handleLabChange = (e) => {
    const selectedId = e.target.value
    const lab = labs.find((lab) => lab.id == selectedId)
    setSelectedLab(lab)
  }
  
  // Validation and calculation
  const validateAndCalculateBooking = () => {
    if (!selectedTime) {
      addTemporaryNotification('error', '⚠️ Please select an available time.')
      return null
    }

    if (!selectedLab.id) {
      addTemporaryNotification('error', '⚠️ Please select a lab.')
      return null
    }

    const labIdNum = Number(selectedLab.id)
    const [hours, minutes] = selectedTime.split(':').map(Number)
    const startDate = new Date(date)
    startDate.setHours(hours)
    startDate.setMinutes(minutes)
    startDate.setSeconds(0)
    startDate.setMilliseconds(0)
    const start = Math.floor(startDate.getTime() / 1000)
    const timeslot = duration * 60

    return { labId: labIdNum, start, timeslot }
  }
  
  // Server-side booking (SSO users)
  const handleServerSideBooking = async () => {
    const bookingData = validateAndCalculateBooking()
    if (!bookingData) return

    if (!institutionBackendUrl) {
      addTemporaryNotification('error', '❌ Missing institutional backend URL.')
      return
    }

    const { labId, start, timeslot } = bookingData
    setIsBooking(true)
    
    try {
      const result = await reservationRequestMutation.mutateAsync({
        tokenId: labId,
        start,
        end: start + timeslot,
        timeslot,
        userAddress, 
        backendUrl: institutionBackendUrl
      })

      addTemporaryNotification('pending', 'Reservation request sent! Processing...')
      const reservationKey =
        result?.intent?.payload?.reservationKey ||
        result?.intent?.payload?.reservation_key ||
        result?.intent?.reservationKey ||
        result?.requestId ||
        null;
      if (reservationKey) {
        setPendingData({
          optimisticId: reservationKey,
          labId,
          start: String(start),
          end: String(start + timeslot)
        });
      }
      await handleBookingSuccess()
    } catch (error) {
      addErrorNotification(error, 'Failed to create reservation: ')
    } finally {
      setIsBooking(false)
    }
  }
  
  // Wallet-based booking
  const handleWalletBooking = async () => {
    if (!isConnected) {
      addTemporaryNotification('error', '🔗 Please connect your wallet first.')
      return
    }

    const contractAddress = contractAddresses[chain.name.toLowerCase()]
    if (!contractAddress || contractAddress === "0x...") {
      addTemporaryNotification('error', 
        `❌ Contract not deployed on ${chain.name || 'this network'}. Please switch to a supported network.`)
      return
    }

    const bookingData = validateAndCalculateBooking()
    if (!bookingData) return

    const { labId, start, timeslot } = bookingData
    const cost = totalCost
    
    if (cost <= 0) {
      addTemporaryNotification('error', '❌ Unable to calculate booking cost.')
      return
    }

    const paymentCheck = checkBalanceAndAllowance(cost)
    
    if (!paymentCheck.hasSufficientBalance) {
      addTemporaryNotification('error', 
        `❌ Insufficient LAB tokens. Required: ${formatBalance(cost)} LAB, Available: ${formatBalance(paymentCheck.balance)} LAB`)
      return
    }

    setIsBooking(true)

    try {
      // Handle token approval if needed
      if (!paymentCheck.hasSufficientAllowance) {
        addTemporaryNotification('pending', 'Approving LAB tokens...')
        
        try {
          await approveLabTokens(cost)
          addTemporaryNotification('success', '✅ Tokens approved!')
        } catch (approvalError) {
          devLog.error('Token approval failed:', approvalError)
          if (approvalError.code === 4001 || approvalError.code === 'ACTION_REJECTED') {
            addTemporaryNotification('warning', '🚫 Token approval rejected by user.')
          } else {
            addErrorNotification(approvalError, 'Token approval failed: ')
          }
          setIsBooking(false)
          return
        }
      }
      
      // Check if time slot is still available
      const finalAvailableTimes = generateTimeOptions({
        date,
        interval: duration,
        lab: selectedLab,
        bookingInfo: (labBookings || []).filter(booking => 
          !isCancelledBooking(booking)
        )
      })
      
      const slotStillAvailable = finalAvailableTimes.find(t => t.value === selectedTime && !t.disabled)
      if (!slotStillAvailable) {
        addTemporaryNotification('error', 
          '❌ The selected time slot is no longer available. Please select a different time.')
        setIsBooking(false)
        return
      }
      
      // Make the reservation
      const result = await reservationRequestMutation.mutateAsync({
        tokenId: labId,
        start,
        end: start + timeslot
      })

      addTemporaryNotification('pending', 'Reservation request sent! Processing...')
      
      // Add optimistic booking to cache
      if (result.hash) {
        const userAddr = address || userAddress
        const startDate = new Date(start * 1000)
        
        const optimisticBookingData = {
          labId: selectedLab.id,
          userAddress: userAddr,
          start: start.toString(),
          end: (start + timeslot).toString(),
          startTime: start,
          endTime: start + timeslot,
          cost: cost.toString(),
          status: 0,
          statusCategory: 'pending',
          date: startDate.toLocaleDateString('en-CA'),
          labName: selectedLab.name,
          isPending: true,
          isOptimistic: true,
          transactionHash: result.hash
        }
        
        const optimisticBooking = bookingCacheUpdates.addOptimisticBooking(optimisticBookingData)
        
        devLog.log('📅 Added optimistic booking to cache:', {
          id: optimisticBooking.id,
          labId,
          start: startDate.toISOString(),
          hash: result.hash
        })
        
        setLastTxHash(result.hash)
        setPendingData({ 
          ...optimisticBookingData,
          optimisticId: optimisticBooking.id
        })
      }
    } catch (error) {
      devLog.error('Error making booking request:', error)
      
      if (error.code === 4001 || error.code === 'ACTION_REJECTED') {
        addTemporaryNotification('warning', '🚫 Transaction rejected by user.')
      } else if (error.message.includes('execution reverted')) {
        addTemporaryNotification('error', '❌ Time slot was reserved while you were booking. Please try another time.')
      } else {
        addErrorNotification(error, 'Failed to create reservation: ')
      }
      
      setIsBooking(false)
    }
  }
  
  // Main booking handler
  const handleBooking = async () => {
    if (isBooking) return
    
    if (isSSO) {
      return await handleServerSideBooking()
    } else {
      return await handleWalletBooking()
    }
  }
  
  if (!isClient) return null
  const isBusy = isBooking || (isWaitingForReceipt && !isSSO && !isReceiptError)

  return (
    <AccessControl message="Please log in to view and make reservations.">
      <Container padding="sm" className="text-white">
        <div className="relative bg-cover bg-center text-white py-5 text-center">
          <h1 className="text-3xl font-bold mb-2">Book a Lab</h1>
        </div>

        {labsError && (
          <div className="bg-red-900/50 border border-red-600 rounded p-4 mb-6">
            <p className="text-red-200">❌ Failed to load labs. Please try again later.</p>
          </div>
        )}

        <div className="mb-6">
          <label className="block text-lg font-semibold mb-2">Select the lab:</label>
          <select
            className="w-full p-3 border-2 bg-gray-800 text-white rounded"
            value={selectedLab?.id || ""}
            onChange={handleLabChange}
          >
            <option value="" disabled>Select a lab</option>
            {labs.map((lab) => (
              <option key={lab.id} value={lab.id}>{lab.name}</option>
            ))}
          </select>
        </div>

        {selectedLab && (
          <>
            <LabDetailsPanel
              lab={selectedLab}
              date={date}
              onDateChange={handleDateChange}
              bookings={labBookings}
              duration={duration}
              onDurationChange={handleDurationChange}
              selectedTime={selectedTime}
              onTimeChange={handleTimeChange}
              availableTimes={availableTimes}
              minDate={minDate}
              maxDate={maxDate}
              forceRefresh={forceRefresh}
              isSSO={isSSO}
              formatPrice={formatPrice}
            />

            <div className="flex flex-col items-center">
              <button
                onClick={handleBooking} 
                disabled={isBusy || !selectedTime}
                className={`w-1/3 text-white p-3 rounded mt-6 transition-colors ${
                  isBusy || !selectedTime
                    ? 'bg-gray-500 cursor-not-allowed' 
                    : 'bg-brand hover:bg-hover-dark'
                }`}
                aria-busy={isBusy}
              >
                <span className="inline-flex items-center justify-center gap-2">
                  {isBusy && <div className="spinner-sm border-white" />}
                  {isBooking ? (isSSO ? 'Processing...' : 'Sending...') : (isWaitingForReceipt && !isSSO && !isReceiptError ? 'Confirming...' : (isReceiptError ? 'Try Again' : 'Book Now'))}
                </span>
              </button>
            </div>
          </>
        )}
      </Container>
    </AccessControl>
  )
}

LabReservation.propTypes = {
  id: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
}
