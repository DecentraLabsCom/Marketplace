import {
  notifyReservationConfirmed,
  notifyReservationDenied,
  notifyReservationAuthorizationCancelled,
  notifyReservationMissingCredential,
  notifyReservationMissingInstitutionalBackend,
  notifyReservationMissingLabSelection,
  notifyReservationMissingTimeSelection,
  notifyReservationOnChainRequested,
  notifyReservationRequestAcceptedAwaitingOnChain,
  notifyReservationProgressAuthorization,
  notifyReservationProgressPreparing,
  notifyReservationProgressSubmitted,
  notifyReservationTxReverted,
  RESERVATION_DENY_REASON,
  reservationToastIds,
} from '../reservationToasts'

describe('reservationToasts', () => {
  const addTemporaryNotification = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('normalizes hash-like reservation keys in dedupe ids', () => {
    const rawHash = '0XABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD'
    const expected = `reservation-confirmed:0x${rawHash.slice(2).toLowerCase()}`

    expect(reservationToastIds.confirmed(rawHash)).toBe(expected)
  })

  test('uses long dedupe window for confirmed and denied', () => {
    notifyReservationConfirmed(addTemporaryNotification, 'reservation-1')
    notifyReservationDenied(addTemporaryNotification, 'reservation-2')

    expect(addTemporaryNotification).toHaveBeenNthCalledWith(
      1,
      'success',
      'Reservation confirmed.',
      null,
      expect.objectContaining({
        dedupeKey: 'reservation-confirmed:reservation-1',
        dedupeWindowMs: 120000,
      })
    )

    expect(addTemporaryNotification).toHaveBeenNthCalledWith(
      2,
      'error',
      'Reservation denied.',
      null,
      expect.objectContaining({
        dedupeKey: 'reservation-denied:reservation-2',
        dedupeWindowMs: 120000,
      })
    )
  })

  test('maps denied reason codes to user-facing messages', () => {
    notifyReservationDenied(addTemporaryNotification, 'reservation-1', {
      reason: RESERVATION_DENY_REASON.PROVIDER_MANUAL,
    })
    notifyReservationDenied(addTemporaryNotification, 'reservation-2', {
      reason: RESERVATION_DENY_REASON.REQUEST_EXPIRED,
    })
    notifyReservationDenied(addTemporaryNotification, 'reservation-3', {
      reason: RESERVATION_DENY_REASON.PAYMENT_FAILED,
    })
    notifyReservationDenied(addTemporaryNotification, 'reservation-4', {
      reason: RESERVATION_DENY_REASON.TREASURY_SPEND_FAILED,
    })

    expect(addTemporaryNotification).toHaveBeenNthCalledWith(
      1,
      'error',
      'Reservation denied by the provider.',
      null,
      expect.objectContaining({ dedupeKey: 'reservation-denied:reservation-1' })
    )
    expect(addTemporaryNotification).toHaveBeenNthCalledWith(
      2,
      'error',
      'Reservation denied by your institution (request expired).',
      null,
      expect.objectContaining({ dedupeKey: 'reservation-denied:reservation-2' })
    )
    expect(addTemporaryNotification).toHaveBeenNthCalledWith(
      3,
      'error',
      'Reservation denied due to payment processing failure.',
      null,
      expect.objectContaining({ dedupeKey: 'reservation-denied:reservation-3' })
    )
    expect(addTemporaryNotification).toHaveBeenNthCalledWith(
      4,
      'error',
      'Reservation denied by your institution (credit charge failed).',
      null,
      expect.objectContaining({ dedupeKey: 'reservation-denied:reservation-4' })
    )
  })

  test('emits reservation progress toasts with stable dedupe keys and durations', () => {
    const payload = { labId: 9, start: 1700000000 }

    notifyReservationProgressPreparing(addTemporaryNotification, payload)
    notifyReservationProgressAuthorization(addTemporaryNotification, payload)
    notifyReservationProgressSubmitted(addTemporaryNotification, payload)

    expect(addTemporaryNotification).toHaveBeenNthCalledWith(
      1,
      'pending',
      'Preparing reservation request...',
      null,
      expect.objectContaining({
        dedupeKey: 'reservation-progress:9:1700000000:prepare',
        duration: 7000,
      })
    )

    expect(addTemporaryNotification).toHaveBeenNthCalledWith(
      2,
      'pending',
      'Waiting for your security key/passkey signature...',
      null,
      expect.objectContaining({
        dedupeKey: 'reservation-progress:9:1700000000:authorize',
        duration: 9000,
      })
    )

    expect(addTemporaryNotification).toHaveBeenNthCalledWith(
      3,
      'pending',
      'Reservation request sent. Processing...',
      null,
      expect.objectContaining({
        dedupeKey: 'reservation-progress:9:1700000000:submitted',
      })
    )
  })

  test('emits validation and onboarding toasts', () => {
    notifyReservationMissingTimeSelection(addTemporaryNotification)
    notifyReservationMissingLabSelection(addTemporaryNotification)
    notifyReservationMissingCredential(addTemporaryNotification)
    notifyReservationMissingInstitutionalBackend(addTemporaryNotification)

    expect(addTemporaryNotification).toHaveBeenNthCalledWith(
      1,
      'error',
      'Please select an available time.',
      null,
      expect.objectContaining({ dedupeKey: 'reservation-validation-missing-time' })
    )
    expect(addTemporaryNotification).toHaveBeenNthCalledWith(
      2,
      'error',
      'Please select a lab.',
      null,
      expect.objectContaining({ dedupeKey: 'reservation-validation-missing-lab' })
    )
    expect(addTemporaryNotification).toHaveBeenNthCalledWith(
      3,
      'warning',
      'WebAuthn credential not registered. Complete Account Setup to continue.',
      null,
      expect.objectContaining({ dedupeKey: 'reservation-webauthn-missing-credential' })
    )
    expect(addTemporaryNotification).toHaveBeenNthCalledWith(
      4,
      'error',
      'Missing institutional backend URL.',
      null,
      expect.objectContaining({ dedupeKey: 'reservation-missing-institutional-backend' })
    )
  })

  test('emits remaining booking lifecycle toasts through unified helper', () => {
    notifyReservationTxReverted(addTemporaryNotification)
    notifyReservationOnChainRequested(addTemporaryNotification, 'reservation-xyz')
    notifyReservationAuthorizationCancelled(addTemporaryNotification)
    notifyReservationRequestAcceptedAwaitingOnChain(addTemporaryNotification, 'reservation-sso-1')

    expect(addTemporaryNotification).toHaveBeenNthCalledWith(
      1,
      'error',
      'Transaction reverted. Reservation was not created.',
      null,
      expect.objectContaining({ dedupeKey: 'reservation-tx-reverted' })
    )
    expect(addTemporaryNotification).toHaveBeenNthCalledWith(
      2,
      'success',
      'Reservation request registered on-chain. Waiting for final confirmation.',
      null,
      expect.objectContaining({ dedupeKey: 'reservation-onchain-requested:reservation-xyz' })
    )
    expect(addTemporaryNotification).toHaveBeenNthCalledWith(
      3,
      'warning',
      'Reservation authorization was cancelled.',
      null,
      expect.objectContaining({ dedupeKey: 'reservation-authorization-cancelled' })
    )
    expect(addTemporaryNotification).toHaveBeenNthCalledWith(
      4,
      'pending',
      'Reservation request accepted. Waiting for on-chain registration...',
      null,
      expect.objectContaining({
        dedupeKey: 'reservation-onchain-pending:reservation-sso-1',
        dedupeWindowMs: 120000,
      })
    )
  })

  test('no-ops when callback is not provided', () => {
    expect(() => notifyReservationConfirmed(undefined, 'reservation-1')).not.toThrow()
    expect(() => notifyReservationTxReverted(null)).not.toThrow()
  })
})
