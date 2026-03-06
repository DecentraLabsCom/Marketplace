import { useCallback, useEffect, useMemo, useState } from 'react'
import { BOOKING_STATE, normalizeBookingStatusState } from '@/utils/booking/bookingStatus'
import { normalizeReservationKey } from '@/utils/booking/reservationKey'
import { findTrackedBookingForFlow, isFinalBookingState } from './flowTracking'

export const SSO_BOOKING_STAGE = {
  IDLE: 'idle',
  PROCESSING: 'processing',
  REQUEST_SENT: 'request_sent',
  REQUEST_REGISTERED: 'request_registered',
}

/**
 * SSO reservation lifecycle state machine driven by booking cache updates/events.
 */
export function useSsoReservationFlow({
  isSSO = false,
  userBookingsForLab = [],
  labBookings = [],
} = {}) {
  const [ssoBookingStage, setSsoBookingStage] = useState(SSO_BOOKING_STAGE.IDLE)
  const [activeSsoRequest, setActiveSsoRequest] = useState(null)

  const combinedBookings = useMemo(() => {
    const userBookings = Array.isArray(userBookingsForLab) ? userBookingsForLab : []
    const labScopedBookings = Array.isArray(labBookings) ? labBookings : []
    return [...userBookings, ...labScopedBookings]
  }, [userBookingsForLab, labBookings])

  const resetSsoReservationFlow = useCallback(() => {
    setSsoBookingStage(SSO_BOOKING_STAGE.IDLE)
    setActiveSsoRequest(null)
  }, [])

  const startSsoProcessing = useCallback(() => {
    if (!isSSO) return
    setSsoBookingStage(SSO_BOOKING_STAGE.PROCESSING)
    setActiveSsoRequest(null)
  }, [isSSO])

  const markSsoRequestSent = useCallback((request) => {
    if (!isSSO) return
    setActiveSsoRequest(
      request
        ? {
            ...request,
            reservationKey: normalizeReservationKey(request?.reservationKey) || request?.reservationKey || null,
          }
        : null
    )
    setSsoBookingStage(SSO_BOOKING_STAGE.REQUEST_SENT)
  }, [isSSO])

  useEffect(() => {
    if (!isSSO) {
      resetSsoReservationFlow()
    }
  }, [isSSO, resetSsoReservationFlow])

  useEffect(() => {
    if (!isSSO || !activeSsoRequest) return

    const tracked = findTrackedBookingForFlow(combinedBookings, activeSsoRequest)
    if (!tracked) return

    const state = normalizeBookingStatusState(tracked)
    if (state === BOOKING_STATE.REQUESTED || state === BOOKING_STATE.PENDING) {
      setSsoBookingStage((prev) =>
        prev === SSO_BOOKING_STAGE.PROCESSING || prev === SSO_BOOKING_STAGE.REQUEST_SENT
          ? SSO_BOOKING_STAGE.REQUEST_REGISTERED
          : prev
      )
      return
    }

    if (isFinalBookingState(state)) {
      resetSsoReservationFlow()
    }
  }, [isSSO, activeSsoRequest, combinedBookings, resetSsoReservationFlow])

  useEffect(() => {
    if (!isSSO || typeof window === 'undefined') return undefined

    const handleDenied = () => {
      resetSsoReservationFlow()
    }

    window.addEventListener('reservation-request-denied', handleDenied)
    return () => window.removeEventListener('reservation-request-denied', handleDenied)
  }, [isSSO, resetSsoReservationFlow])

  const isSSOFlowLocked = isSSO && ssoBookingStage !== SSO_BOOKING_STAGE.IDLE

  return {
    ssoBookingStage,
    activeSsoRequest,
    isSSOFlowLocked,
    startSsoProcessing,
    markSsoRequestSent,
    resetSsoReservationFlow,
  }
}
