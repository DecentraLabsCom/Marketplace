import { useCallback, useEffect, useMemo, useState } from 'react'
import { BOOKING_STATE, normalizeBookingStatusState } from '@/utils/booking/bookingStatus'
import { normalizeReservationKey } from '@/utils/booking/reservationKey'
import { SSO_BOOKING_STAGE } from './useSsoReservationFlow'
import { findTrackedBookingForFlow, isFinalBookingState } from './flowTracking'

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

    const tracked = findTrackedBookingForFlow(combinedBookings, activeWalletRequest)
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

    if (isFinalBookingState(state)) {
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
