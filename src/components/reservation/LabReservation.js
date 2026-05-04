/**
 * Main lab reservation component - REFACTORED VERSION
 * Orchestrates the booking creation flow using extracted components and hooks
 */
"use client"
import React, { useState, useMemo, useEffect } from 'react'
import PropTypes from 'prop-types'
import { Container } from '@/components/ui'
import { useUser } from '@/context/UserContext'
import { useNotifications } from '@/context/NotificationContext'
import { useLabsForReservation } from '@/hooks/lab/useLabs'
import { useLabBookingsDashboard, useBookingsForCalendar } from '@/hooks/booking/useBookings'
import { useLabReservationState } from '@/hooks/reservation/useLabReservationState'
import AccessControl from '@/components/auth/AccessControl'
import LabDetailsPanel from '@/components/reservation/LabDetailsPanel'
import devLog from '@/utils/dev/logger'
import {
  notifyReservationMissingInstitutionalBackend,
  notifyReservationMissingLabSelection,
  notifyReservationMissingCredential,
  notifyReservationAuthorizationCancelled,
  notifyReservationMissingTimeSelection,
  notifyReservationProgressAuthorization,
  notifyReservationProgressPreparing,
  notifyReservationProgressSubmitted,
} from '@/utils/notifications/reservationToasts'

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
  const {
    isSSO,
    address: userAddress,
    institutionBackendUrl,
    institutionalOnboardingStatus,
    openOnboardingModal,
  } = useUser()
  const { addTemporaryNotification, addErrorNotification } = useNotifications()
  
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
  const canFetchLabBookings = Boolean(selectedLab?.id && isSSO);
  const { data: labBookingsData } = useLabBookingsDashboard(selectedLab?.id, {
    queryOptions: { enabled: canFetchLabBookings }
  })
  const labBookings = useMemo(() => 
    labBookingsData?.bookings || [], 
    [labBookingsData]
  )

  const canFetchUserBookings = Boolean(selectedLab?.id && isSSO)
  const { data: userBookingsData } = useBookingsForCalendar(null, selectedLab?.id, {
    enabled: canFetchUserBookings,
    isSSO
  })
  const userBookingsForLab = useMemo(() => {
    if (!selectedLab?.id) return []
    const bookings = userBookingsData?.userBookings || []
    return bookings.filter(booking => String(booking.labId) === String(selectedLab.id))
  }, [userBookingsData, selectedLab?.id])

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
    calendarUserBookingsForLab,
    totalCost,
    ssoBookingStage,
    isSSOFlowLocked,
    reservationButtonState,
    setIsBooking,
    setPendingData,
    handleDateChange,
    handleDurationChange,
    handleTimeChange,
    handleBookingSuccess,
    startSsoProcessing,
    markSsoRequestSent,
    resetSsoReservationFlow,
    formatPrice,
    reservationRequestMutation,
  } = useLabReservationState({
    selectedLab,
    labBookings,
    userBookingsForLab,
    isSSO,
  })
  const resolvedSsoStage = ssoBookingStage || 'idle'
  
  // Handle lab selection
  const handleLabChange = (e) => {
    const selectedId = e.target.value
    const lab = labs.find((lab) => lab.id == selectedId)
    setSelectedLab(lab)
  }
  
  // Validation and calculation
  const validateAndCalculateBooking = () => {
    if (!selectedTime) {
      notifyReservationMissingTimeSelection(addTemporaryNotification)
      return null
    }

    if (!selectedLab.id) {
      notifyReservationMissingLabSelection(addTemporaryNotification)
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
      notifyReservationMissingInstitutionalBackend(addTemporaryNotification)
      return
    }

    const { labId, start, timeslot } = bookingData
    if (typeof startSsoProcessing === 'function') {
      startSsoProcessing()
    }

    const progressStagesShown = new Set()
    const emitProgressToast = ({ stage } = {}) => {
      if (!stage || progressStagesShown.has(stage)) return
      progressStagesShown.add(stage)
      const progressPayload = { labId, start }

      if (stage === 'preparing_intent') {
        notifyReservationProgressPreparing(addTemporaryNotification, progressPayload)
      } else if (stage === 'awaiting_authorization' || stage === 'awaiting_webauthn_assertion') {
        notifyReservationProgressAuthorization(addTemporaryNotification, progressPayload)
      }
    }

    setIsBooking(true)
    
    try {
      const result = await reservationRequestMutation.mutateAsync({
        tokenId: labId,
        start,
        end: start + timeslot,
        timeslot,
        userAddress, 
        backendUrl: institutionBackendUrl,
        onProgress: emitProgressToast
      })

      notifyReservationProgressSubmitted(addTemporaryNotification, { labId, start })
      const reservationKey =
        result?.intent?.payload?.reservationKey ||
        result?.intent?.payload?.reservation_key ||
        result?.intent?.reservationKey ||
        result?.requestId ||
        `pending-${Date.now()}`;
      setPendingData({
        optimisticId: reservationKey,
        labId,
        userAddress,
        start: String(start),
        end: String(start + timeslot),
        isOptimistic: true
      });
      if (typeof markSsoRequestSent === 'function') {
        markSsoRequestSent({
          reservationKey,
          labId,
          start: String(start),
          end: String(start + timeslot),
          action: result?.intent?.meta?.action,
        })
      }
      await handleBookingSuccess()
    } catch (error) {
      const errorMessage = typeof error?.message === 'string' ? error.message : ''
      const isAuthorizationCancelled =
        error?.code === 'INTENT_AUTH_CANCELLED' ||
        error?.name === 'NotAllowedError' ||
        errorMessage.includes('Authorization cancelled by user')

      if (isAuthorizationCancelled) {
        notifyReservationAuthorizationCancelled(addTemporaryNotification)
        if (
          institutionalOnboardingStatus === 'advisory' &&
          typeof openOnboardingModal === 'function'
        ) {
          openOnboardingModal()
        }
        if (typeof resetSsoReservationFlow === 'function') {
          resetSsoReservationFlow()
        }
        return
      }

      const missingCredential =
        error?.code === 'WEBAUTHN_CREDENTIAL_NOT_REGISTERED' ||
        errorMessage.includes('webauthn_credential_not_registered')

      if (missingCredential) {
        notifyReservationMissingCredential(addTemporaryNotification)
        if (typeof openOnboardingModal === 'function') {
          openOnboardingModal()
        }
        if (typeof resetSsoReservationFlow === 'function') {
          resetSsoReservationFlow()
        }
        return
      }
      addErrorNotification(error, 'Failed to create reservation: ')
      if (typeof resetSsoReservationFlow === 'function') {
        resetSsoReservationFlow()
      }
    } finally {
      setIsBooking(false)
    }
  }
  
  // Main booking handler
  const handleBooking = async () => {
    if (reservationButtonState?.isBusy || isBooking) return
    if (!isSSO || (isSSOFlowLocked || resolvedSsoStage !== 'idle')) return
    return await handleServerSideBooking()
  }
  
  if (!isClient) return null
  const buttonState = reservationButtonState || (() => {
    const isBusy = isBooking
    const isLocked = Boolean(resolvedSsoStage !== 'idle')
    const isDisabled = isBusy || !selectedTime || isLocked

    let label = 'Book Now'
    if (isBooking || resolvedSsoStage === 'processing') label = 'Processing...'
    else if (resolvedSsoStage === 'request_sent') label = 'Request Sent'
    else if (resolvedSsoStage === 'request_registered') label = 'Request Registered'

    return {
      label,
      isBusy,
      isDisabled,
      showSpinner: isBusy || isLocked,
      ariaBusy: isBusy,
    }
  })()

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
              userBookings={calendarUserBookingsForLab || userBookingsForLab}
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
                disabled={buttonState.isDisabled}
                className={`w-1/3 text-white p-3 rounded mt-6 transition-colors ${
                  buttonState.isDisabled
                    ? 'bg-gray-500 cursor-not-allowed' 
                    : 'bg-brand hover:bg-hover-dark'
                }`}
                aria-busy={buttonState.ariaBusy}
              >
                <span className="inline-flex items-center justify-center gap-2">
                  {buttonState.showSpinner && <div className="spinner spinner-sm border-white" />}
                  {buttonState.label}
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
