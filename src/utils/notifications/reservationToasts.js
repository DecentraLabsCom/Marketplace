const RESERVATION_CONFIRM_DEDUPE_WINDOW_MS = 120000

const normalizeReservationKey = (reservationKey) => {
  if (reservationKey === undefined || reservationKey === null) return null
  const raw = String(reservationKey).trim()
  if (!raw) return null

  const lower = raw.toLowerCase()
  const withoutPrefix = lower.startsWith('0x') ? lower.slice(2) : lower
  if (/^[0-9a-f]{64}$/i.test(withoutPrefix)) {
    return `0x${withoutPrefix}`
  }

  return raw
}

export const reservationToastIds = {
  confirmed: (reservationKey) => `reservation-confirmed:${normalizeReservationKey(reservationKey) || 'unknown'}`,
  denied: (reservationKey) => `reservation-denied:${normalizeReservationKey(reservationKey) || 'unknown'}`,
  txReverted: () => 'reservation-tx-reverted',
  onchainRequested: (reservationKey) => `reservation-onchain-requested:${normalizeReservationKey(reservationKey) || 'unknown'}`,
  progressPrepare: ({ labId, start }) => `reservation-progress:${String(labId)}:${String(start)}:prepare`,
  progressAuthorize: ({ labId, start }) => `reservation-progress:${String(labId)}:${String(start)}:authorize`,
  progressSubmitted: ({ labId, start }) => `reservation-progress:${String(labId)}:${String(start)}:submitted`,
  missingCredential: () => 'reservation-webauthn-missing-credential',
  validationMissingTime: () => 'reservation-validation-missing-time',
  validationMissingLab: () => 'reservation-validation-missing-lab',
  missingInstitutionalBackend: () => 'reservation-missing-institutional-backend',
  walletNotConnected: () => 'reservation-wallet-not-connected',
  walletUnsupportedNetwork: (network) => `reservation-wallet-unsupported-network:${String(network || 'unknown').toLowerCase()}`,
  walletInvalidCost: () => 'reservation-wallet-invalid-cost',
  walletInsufficientTokens: () => 'reservation-wallet-insufficient-tokens',
  walletApprovalPending: () => 'reservation-wallet-approval-pending',
  walletApprovalSuccess: () => 'reservation-wallet-approval-success',
  walletApprovalRejected: () => 'reservation-wallet-approval-rejected',
  walletSlotUnavailable: ({ labId, start }) => `reservation-wallet-slot-unavailable:${String(labId)}:${String(start)}`,
  walletTransactionRejected: () => 'reservation-wallet-transaction-rejected',
  walletTimeslotConflict: ({ labId, start }) => `reservation-wallet-timeslot-conflict:${String(labId)}:${String(start)}`,
}

const notify = (addTemporaryNotification, type, message, dedupeKey, extraOptions = {}) => {
  if (typeof addTemporaryNotification !== 'function') return
  addTemporaryNotification(type, message, null, {
    dedupeKey,
    dedupeWindowMs: 20000,
    ...extraOptions,
  })
}

export const notifyReservationConfirmed = (addTemporaryNotification, reservationKey) => {
  notify(addTemporaryNotification, 'success', '✅ Reservation confirmed!', reservationToastIds.confirmed(reservationKey), {
    dedupeWindowMs: RESERVATION_CONFIRM_DEDUPE_WINDOW_MS,
  })
}

export const notifyReservationDenied = (addTemporaryNotification, reservationKey) => {
  notify(addTemporaryNotification, 'error', '❌ Reservation denied by the provider.', reservationToastIds.denied(reservationKey), {
    dedupeWindowMs: RESERVATION_CONFIRM_DEDUPE_WINDOW_MS,
  })
}

export const notifyReservationTxReverted = (addTemporaryNotification) => {
  notify(addTemporaryNotification, 'error', '❌ Transaction reverted. Reservation was not created.', reservationToastIds.txReverted())
}

export const notifyReservationOnChainRequested = (addTemporaryNotification, reservationKey) => {
  notify(
    addTemporaryNotification,
    'success',
    '✅ Reservation request registered on-chain! Waiting for final confirmation...',
    reservationToastIds.onchainRequested(reservationKey)
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
    'Reservation request sent! Processing...',
    reservationToastIds.progressSubmitted(payload)
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
  notify(addTemporaryNotification, 'error', '⚠️ Please select an available time.', reservationToastIds.validationMissingTime())

export const notifyReservationMissingLabSelection = (addTemporaryNotification) =>
  notify(addTemporaryNotification, 'error', '⚠️ Please select a lab.', reservationToastIds.validationMissingLab())

export const notifyReservationMissingInstitutionalBackend = (addTemporaryNotification) =>
  notify(addTemporaryNotification, 'error', '❌ Missing institutional backend URL.', reservationToastIds.missingInstitutionalBackend())

export const notifyReservationWalletDisconnected = (addTemporaryNotification) =>
  notify(addTemporaryNotification, 'error', '🔗 Please connect your wallet first.', reservationToastIds.walletNotConnected())

export const notifyReservationWalletUnsupportedNetwork = (addTemporaryNotification, chainName) =>
  notify(
    addTemporaryNotification,
    'error',
    `❌ Contract not deployed on ${chainName || 'this network'}. Please switch to a supported network.`,
    reservationToastIds.walletUnsupportedNetwork(chainName)
  )

export const notifyReservationWalletInvalidCost = (addTemporaryNotification) =>
  notify(addTemporaryNotification, 'error', '❌ Unable to calculate booking cost.', reservationToastIds.walletInvalidCost())

export const notifyReservationWalletInsufficientTokens = (addTemporaryNotification, required, available) =>
  notify(
    addTemporaryNotification,
    'error',
    `❌ Insufficient LAB tokens. Required: ${required} LAB, Available: ${available} LAB`,
    reservationToastIds.walletInsufficientTokens()
  )

export const notifyReservationWalletApprovalPending = (addTemporaryNotification) =>
  notify(addTemporaryNotification, 'pending', 'Approving LAB tokens...', reservationToastIds.walletApprovalPending(), {
    duration: 8000,
  })

export const notifyReservationWalletApprovalSuccess = (addTemporaryNotification) =>
  notify(addTemporaryNotification, 'success', '✅ Tokens approved!', reservationToastIds.walletApprovalSuccess())

export const notifyReservationWalletApprovalRejected = (addTemporaryNotification) =>
  notify(addTemporaryNotification, 'warning', '🚫 Token approval rejected by user.', reservationToastIds.walletApprovalRejected())

export const notifyReservationWalletSlotUnavailable = (addTemporaryNotification, payload) =>
  notify(
    addTemporaryNotification,
    'error',
    '❌ The selected time slot is no longer available. Please select a different time.',
    reservationToastIds.walletSlotUnavailable(payload)
  )

export const notifyReservationWalletTransactionRejected = (addTemporaryNotification) =>
  notify(addTemporaryNotification, 'warning', '🚫 Transaction rejected by user.', reservationToastIds.walletTransactionRejected())

export const notifyReservationWalletTimeslotConflict = (addTemporaryNotification, payload) =>
  notify(
    addTemporaryNotification,
    'error',
    '❌ Time slot was reserved while you were booking. Please try another time.',
    reservationToastIds.walletTimeslotConflict(payload)
  )
