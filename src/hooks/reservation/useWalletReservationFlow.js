import { useCallback, useEffect, useMemo, useState } from 'react'
import { BOOKING_STATE, normalizeBookingStatusState } from '@/utils/booking/bookingStatus'
import { normalizeReservationKey } from '@/utils/booking/reservationKey'
import { SSO_BOOKING_STAGE } from './useSsoReservationFlow'

const toEpochSeconds = (value) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

const findTrackedWalletBooking = (bookings, activeRequest) => {
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
 * Wallet reservation lifecycle state machine driven by booking cache updates/events.
 * Mirrors SSO button lifecycle: processing -> request_sent -> request_registered -> idle.
 */
export function useWalletReservationFlow({
  isWallet = false,
  userBookingsForLab = [],
  labBookings = [],
} = {}) {
  const [walletBookingStage, setWalletBookingStage] = useState(SSO_BOOKING_STAGE.IDLE)
  const [activeWalletRequest, setActiveWalletRequest] = useState(null)

  const combinedBookings = useMemo(() => {
    const userBookings = Array.isArray(userBookingsForLab) ? userBookingsForLab : []
    const labScopedBookings = Array.isArray(labBookings) ? labBookings : []
    return [...userBookings, ...labScopedBookings]
  }, [userBookingsForLab, labBookings])

  const resetWalletReservationFlow = useCallback(() => {
    setWalletBookingStage(SSO_BOOKING_STAGE.IDLE)
    setActiveWalletRequest(null)
  }, [])

  const startWalletProcessing = useCallback(() => {
    if (!isWallet) return
    setWalletBookingStage(SSO_BOOKING_STAGE.PROCESSING)
    setActiveWalletRequest(null)
  }, [isWallet])

  const markWalletRequestSent = useCallback((request) => {
    if (!isWallet) return
    setActiveWalletRequest(
      request
        ? {
            ...request,
            reservationKey: normalizeReservationKey(request?.reservationKey) || request?.reservationKey || null,
          }
        : null
    )
    setWalletBookingStage(SSO_BOOKING_STAGE.REQUEST_SENT)
  }, [isWallet])

  useEffect(() => {
    if (!isWallet) {
      resetWalletReservationFlow()
    }
  }, [isWallet, resetWalletReservationFlow])

  useEffect(() => {
    if (!isWallet || !activeWalletRequest) return

    const tracked = findTrackedWalletBooking(combinedBookings, activeWalletRequest)
    if (!tracked) return

    const state = normalizeBookingStatusState(tracked)
    if (state === BOOKING_STATE.REQUESTED || state === BOOKING_STATE.PENDING) {
      setWalletBookingStage((prev) =>
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
      resetWalletReservationFlow()
    }
  }, [isWallet, activeWalletRequest, combinedBookings, resetWalletReservationFlow])

  useEffect(() => {
    if (!isWallet || typeof window === 'undefined') return undefined

    const handleDenied = () => {
      resetWalletReservationFlow()
    }

    window.addEventListener('reservation-request-denied', handleDenied)
    return () => window.removeEventListener('reservation-request-denied', handleDenied)
  }, [isWallet, resetWalletReservationFlow])

  const isWalletFlowLocked = isWallet && walletBookingStage !== SSO_BOOKING_STAGE.IDLE

  return {
    walletBookingStage,
    activeWalletRequest,
    isWalletFlowLocked,
    startWalletProcessing,
    markWalletRequestSent,
    resetWalletReservationFlow,
  }
}

