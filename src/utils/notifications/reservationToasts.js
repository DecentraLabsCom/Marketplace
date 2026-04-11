import { normalizeReservationKey } from '@/utils/booking/reservationKey'

const RESERVATION_CONFIRM_DEDUPE_WINDOW_MS = 120000

export const RESERVATION_DENY_REASON = {
  PROVIDER_MANUAL: 1,
  PROVIDER_NOT_ELIGIBLE: 2,
  PAYMENT_FAILED: 3,
  REQUEST_EXPIRED: 4,
  TREASURY_SPEND_FAILED: 5,
}

export const reservationToastIds = {
  confirmed: (reservationKey) => `reservation-confirmed:${normalizeReservationKey(reservationKey) || 'unknown'}`,
  denied: (reservationKey) => `reservation-denied:${normalizeReservationKey(reservationKey) || 'unknown'}`,
  txReverted: () => 'reservation-tx-reverted',
  onchainRequested: (reservationKey) => `reservation-onchain-requested:${normalizeReservationKey(reservationKey) || 'unknown'}`,
  onchainPending: (reservationKey) => `reservation-onchain-pending:${normalizeReservationKey(reservationKey) || 'unknown'}`,
  progressPrepare: ({ labId, start }) => `reservation-progress:${String(labId)}:${String(start)}:prepare`,
  progressAuthorize: ({ labId, start }) => `reservation-progress:${String(labId)}:${String(start)}:authorize`,
  progressSubmitted: ({ labId, start }) => `reservation-progress:${String(labId)}:${String(start)}:submitted`,
  authorizationCancelled: () => 'reservation-authorization-cancelled',
  missingCredential: () => 'reservation-webauthn-missing-credential',
  validationMissingTime: () => 'reservation-validation-missing-time',
  validationMissingLab: () => 'reservation-validation-missing-lab',
  missingInstitutionalBackend: () => 'reservation-missing-institutional-backend',
}

import { notify } from './notify'

const resolveReservationDeniedMessage = (reason) => {
  const numericReason = Number(reason)

  switch (numericReason) {
    case RESERVATION_DENY_REASON.PROVIDER_MANUAL:
      return 'Reservation denied by the provider.'
    case RESERVATION_DENY_REASON.PROVIDER_NOT_ELIGIBLE:
      return 'Reservation denied: provider cannot fulfill this reservation right now.'
    case RESERVATION_DENY_REASON.PAYMENT_FAILED:
      return 'Reservation denied due to payment processing failure.'
    case RESERVATION_DENY_REASON.REQUEST_EXPIRED:
      return 'Reservation denied by your institution (request expired).'
    case RESERVATION_DENY_REASON.TREASURY_SPEND_FAILED:
      return 'Reservation denied by your institution (credit charge failed).'
    default:
      return 'Reservation denied.'
  }
}

export const notifyReservationConfirmed = (addTemporaryNotification, reservationKey) => {
  notify(addTemporaryNotification, 'success', 'Reservation confirmed.', reservationToastIds.confirmed(reservationKey), {
    dedupeWindowMs: RESERVATION_CONFIRM_DEDUPE_WINDOW_MS,
  })
}

export const notifyReservationDenied = (addTemporaryNotification, reservationKey, options = {}) => {
  notify(
    addTemporaryNotification,
    'error',
    resolveReservationDeniedMessage(options?.reason),
    reservationToastIds.denied(reservationKey),
    { dedupeWindowMs: RESERVATION_CONFIRM_DEDUPE_WINDOW_MS }
  )
}

export const notifyReservationTxReverted = (addTemporaryNotification) => {
  notify(addTemporaryNotification, 'error', 'Transaction reverted. Reservation was not created.', reservationToastIds.txReverted())
}

export const notifyReservationOnChainRequested = (addTemporaryNotification, reservationKey) => {
  notify(
    addTemporaryNotification,
    'success',
    'Reservation request registered on-chain. Waiting for final confirmation.',
    reservationToastIds.onchainRequested(reservationKey)
  )
}

export const notifyReservationRequestAcceptedAwaitingOnChain = (addTemporaryNotification, reservationKey) => {
  notify(
    addTemporaryNotification,
    'pending',
    'Reservation request accepted. Waiting for on-chain registration...',
    reservationToastIds.onchainPending(reservationKey),
    {
      dedupeWindowMs: RESERVATION_CONFIRM_DEDUPE_WINDOW_MS,
    }
  )
}

export const notifyReservationProgressPreparing = (addTemporaryNotification, payload) => {
  notify(addTemporaryNotification, 'pending', 'Preparing reservation request...', reservationToastIds.progressPrepare(payload), {
    duration: 7000,
  })
}

export const notifyReservationProgressAuthorization = (addTemporaryNotification, payload) => {
  notify(
    addTemporaryNotification,
    'pending',
    'Waiting for your security key/passkey signature...',
    reservationToastIds.progressAuthorize(payload),
    { duration: 9000 }
  )
}

export const notifyReservationProgressSubmitted = (addTemporaryNotification, payload) => {
  notify(
    addTemporaryNotification,
    'pending',
    'Reservation request sent. Processing...',
    reservationToastIds.progressSubmitted(payload)
  )
}

export const notifyReservationAuthorizationCancelled = (addTemporaryNotification) => {
  notify(
    addTemporaryNotification,
    'warning',
    'Reservation authorization was cancelled.',
    reservationToastIds.authorizationCancelled()
  )
}

export const notifyReservationMissingCredential = (addTemporaryNotification) => {
  notify(
    addTemporaryNotification,
    'warning',
    'WebAuthn credential not registered. Complete Account Setup to continue.',
    reservationToastIds.missingCredential()
  )
}

export const notifyReservationMissingTimeSelection = (addTemporaryNotification) =>
  notify(addTemporaryNotification, 'error', 'Please select an available time.', reservationToastIds.validationMissingTime())

export const notifyReservationMissingLabSelection = (addTemporaryNotification) =>
  notify(addTemporaryNotification, 'error', 'Please select a lab.', reservationToastIds.validationMissingLab())

export const notifyReservationMissingInstitutionalBackend = (addTemporaryNotification) =>
  notify(addTemporaryNotification, 'error', 'Missing institutional backend URL.', reservationToastIds.missingInstitutionalBackend())
