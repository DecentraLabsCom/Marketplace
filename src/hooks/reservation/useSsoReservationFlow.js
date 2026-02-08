import { useCallback, useEffect, useMemo, useState } from 'react'
import { BOOKING_STATE, normalizeBookingStatusState } from '@/utils/booking/bookingStatus'
import { normalizeReservationKey } from '@/utils/booking/reservationKey'

export const SSO_BOOKING_STAGE = {
  IDLE: 'idle',
  PROCESSING: 'processing',
  REQUEST_SENT: 'request_sent',
  REQUEST_REGISTERED: 'request_registered',
}

const toEpochSeconds = (value) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

const findTrackedSsoBooking = (bookings, activeRequest) => {
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
  })
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

    const tracked = findTrackedSsoBooking(combinedBookings, activeSsoRequest)
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

    if (
      state === BOOKING_STATE.CONFIRMED ||
      state === BOOKING_STATE.IN_USE ||
      state === BOOKING_STATE.COMPLETED ||
      state === BOOKING_STATE.COLLECTED ||
      state === BOOKING_STATE.CANCELLED
    ) {
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

