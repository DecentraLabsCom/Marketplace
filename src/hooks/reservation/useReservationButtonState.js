import { useMemo } from 'react'
import { SSO_BOOKING_STAGE } from './useSsoReservationFlow'

/**
 * Reservation button state for the institutional booking flow.
 */
export function useReservationButtonState({
  selectedTime,
  isBooking = false,
  bookingStage = SSO_BOOKING_STAGE.IDLE,
  isFlowLocked = false,
} = {}) {
  return useMemo(() => {
    const hasSelectedTime = Boolean(selectedTime)
    const isBusy = isBooking
    const isDisabled = isBusy || !hasSelectedTime || isFlowLocked
    const showSpinner = isBusy || isFlowLocked
    const ariaBusy = isBusy

    let label = 'Book Now'
    if (isBooking || bookingStage === SSO_BOOKING_STAGE.PROCESSING) {
      label = 'Processing...'
    } else if (bookingStage === SSO_BOOKING_STAGE.REQUEST_SENT) {
      label = 'Request Sent'
    } else if (bookingStage === SSO_BOOKING_STAGE.REQUEST_REGISTERED) {
      label = 'Request Registered'
    }

    return {
      label,
      isBusy,
      isDisabled,
      showSpinner,
      ariaBusy,
      hasSelectedTime,
    }
  }, [selectedTime, isBooking, bookingStage, isFlowLocked])
}
