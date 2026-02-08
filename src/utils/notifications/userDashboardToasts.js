export const userDashboardToastIds = {
  missingBookingSelection: () => 'user-dashboard-missing-booking-selection',
  alreadyCanceled: () => 'user-dashboard-already-canceled',
  walletRequired: () => 'user-dashboard-wallet-required',
  cancellationProcessing: (reservationKey) => `user-dashboard-cancellation-processing:${String(reservationKey || 'unknown')}`,
  cancellationSubmitted: (reservationKey) => `user-dashboard-cancellation-submitted:${String(reservationKey || 'unknown')}`,
  cancellationConfirmed: (reservationKey) => `user-dashboard-cancellation-confirmed:${String(reservationKey || 'unknown')}`,
  cancellationRejected: () => 'user-dashboard-cancellation-rejected',
  cancellationFailed: (reservationKey) => `user-dashboard-cancellation-failed:${String(reservationKey || 'unknown')}`,
}

const notify = (addTemporaryNotification, type, message, dedupeKey, extraOptions = {}) => {
  if (typeof addTemporaryNotification !== 'function') return
  addTemporaryNotification(type, message, null, {
    dedupeKey,
    dedupeWindowMs: 20000,
    ...extraOptions,
  })
}

export const notifyUserDashboardMissingBookingSelection = (addTemporaryNotification) =>
  notify(
    addTemporaryNotification,
    'error',
    'No booking selected or missing reservation key.',
    userDashboardToastIds.missingBookingSelection()
  )

export const notifyUserDashboardAlreadyCanceled = (addTemporaryNotification) =>
  notify(
    addTemporaryNotification,
    'warning',
    'This reservation is already canceled.',
    userDashboardToastIds.alreadyCanceled()
  )

export const notifyUserDashboardWalletRequired = (addTemporaryNotification) =>
  notify(
    addTemporaryNotification,
    'error',
    'Please connect your wallet first.',
    userDashboardToastIds.walletRequired()
  )

export const notifyUserDashboardCancellationRejected = (addTemporaryNotification) =>
  notify(
    addTemporaryNotification,
    'warning',
    'Transaction rejected by user.',
    userDashboardToastIds.cancellationRejected()
  )

export const notifyUserDashboardCancellationFailed = (addTemporaryNotification, reservationKey) =>
  notify(
    addTemporaryNotification,
    'error',
    'Cancellation failed. Please try again.',
    userDashboardToastIds.cancellationFailed(reservationKey)
  )

export const notifyUserDashboardCancellationProcessing = (
  addTemporaryNotification,
  reservationKey,
  options = {}
) =>
  notify(
    addTemporaryNotification,
    'pending',
    options?.isRequest
      ? 'Cancelling reservation request...'
      : 'Cancelling booking...',
    userDashboardToastIds.cancellationProcessing(reservationKey)
  )

export const notifyUserDashboardCancellationSubmitted = (
  addTemporaryNotification,
  reservationKey,
  options = {}
) =>
  notify(
    addTemporaryNotification,
    'pending',
    options?.isRequest
      ? 'Cancellation request sent. Waiting for on-chain confirmation...'
      : 'Booking cancellation sent. Waiting for on-chain confirmation...',
    userDashboardToastIds.cancellationSubmitted(reservationKey)
  )

export const notifyUserDashboardCancellationConfirmed = (
  addTemporaryNotification,
  reservationKey,
  options = {}
) =>
  notify(
    addTemporaryNotification,
    'success',
    options?.isRequest
      ? 'Reservation request cancelled successfully.'
      : 'Booking cancelled successfully.',
    userDashboardToastIds.cancellationConfirmed(reservationKey),
    {
      dedupeWindowMs: 120000,
    }
  )
