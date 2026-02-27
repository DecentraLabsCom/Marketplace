import { useMemo } from 'react'
import { SSO_BOOKING_STAGE } from './useSsoReservationFlow'

/**
 * Unified reservation button state.
 * Designed to support both SSO and wallet flows with one API.
 */
export function useReservationButtonState({
  isSSO = false,
  selectedTime,
  isBooking = false,
  isWaitingForReceipt = false,
  isReceiptError = false,
  ssoBookingStage = SSO_BOOKING_STAGE.IDLE,
  isSSOFlowLocked = false,
  walletBookingStage = SSO_BOOKING_STAGE.IDLE,
  isWalletFlowLocked = false,
} = {}) {
  return useMemo(() => {
    const hasSelectedTime = Boolean(selectedTime)
    const isBusy = isBooking || (isWaitingForReceipt && !isSSO && !isReceiptError)
    const isFlowLocked = isSSO ? isSSOFlowLocked : isWalletFlowLocked
    const isDisabled = isBusy || !hasSelectedTime || isFlowLocked
    const showSpinner = isBusy || isFlowLocked
    const ariaBusy = isBusy

    let label = 'Book Now'
    if (isSSO) {
      if (isBooking || ssoBookingStage === SSO_BOOKING_STAGE.PROCESSING) label = 'Processing...'
      else if (ssoBookingStage === SSO_BOOKING_STAGE.REQUEST_SENT) label = 'Request Sent'
      else if (ssoBookingStage === SSO_BOOKING_STAGE.REQUEST_REGISTERED) label = 'Request Registered'
    } else if (walletBookingStage === SSO_BOOKING_STAGE.REQUEST_SENT) {
      label = 'Request Sent'
    } else if (walletBookingStage === SSO_BOOKING_STAGE.REQUEST_REGISTERED) {
      label = 'Request Registered'
    } else if (isWaitingForReceipt && !isReceiptError) {
      // TX is in the mempool — give specific feedback instead of generic "Processing..."
      label = 'Awaiting confirmation...'
    } else if (walletBookingStage === SSO_BOOKING_STAGE.PROCESSING || isBooking) {
      label = 'Processing...'
    } else if (isReceiptError) {
      label = 'Try Again'
    }

    return {
      label,
      isBusy,
      isDisabled,
      showSpinner,
      ariaBusy,
      hasSelectedTime,
    }
  }, [
    isSSO,
    selectedTime,
    isBooking,
    isWaitingForReceipt,
    isReceiptError,
    ssoBookingStage,
    isSSOFlowLocked,
    walletBookingStage,
    isWalletFlowLocked,
  ])
}
