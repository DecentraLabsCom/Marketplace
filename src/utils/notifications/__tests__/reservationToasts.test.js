import {
  notifyReservationConfirmed,
  notifyReservationDenied,
  notifyReservationAuthorizationCancelled,
  notifyReservationMissingCredential,
  notifyReservationOnChainRequested,
  notifyReservationRequestAcceptedAwaitingOnChain,
  notifyReservationProgressAuthorization,
  notifyReservationProgressPreparing,
  notifyReservationProgressSubmitted,
  notifyReservationTxReverted,
  notifyReservationWalletApprovalPending,
  notifyReservationWalletApprovalRejected,
  notifyReservationWalletApprovalSuccess,
  notifyReservationWalletDisconnected,
  notifyReservationWalletInsufficientTokens,
  notifyReservationWalletInvalidCost,
  notifyReservationWalletSlotUnavailable,
  notifyReservationWalletTimeslotConflict,
  notifyReservationWalletTransactionRejected,
  notifyReservationWalletUnsupportedNetwork,
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

  test('uses long dedupe window for confirmed/denied', () => {
    notifyReservationConfirmed(addTemporaryNotification, 'reservation-1')
    notifyReservationDenied(addTemporaryNotification, 'reservation-2')

    expect(addTemporaryNotification).toHaveBeenNthCalledWith(
      1,
      'success',
      expect.stringContaining('Reservation confirmed'),
      null,
      expect.objectContaining({
        dedupeKey: 'reservation-confirmed:reservation-1',
        dedupeWindowMs: 120000,
      })
    )

    expect(addTemporaryNotification).toHaveBeenNthCalledWith(
      2,
      'error',
      expect.stringContaining('Reservation denied'),
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
      isSSO: true,
    })
    notifyReservationDenied(addTemporaryNotification, 'reservation-2', {
      reason: RESERVATION_DENY_REASON.REQUEST_EXPIRED,
      isSSO: true,
    })
    notifyReservationDenied(addTemporaryNotification, 'reservation-3', {
      reason: RESERVATION_DENY_REASON.PAYMENT_FAILED,
      isSSO: false,
    })
    notifyReservationDenied(addTemporaryNotification, 'reservation-4', {
      reason: RESERVATION_DENY_REASON.REQUEST_EXPIRED,
      isSSO: false,
    })
    notifyReservationDenied(addTemporaryNotification, 'reservation-5', {
      isSSO: true,
    })

    expect(addTemporaryNotification).toHaveBeenNthCalledWith(
      1,
      'error',
      '❌ Reservation denied by the provider.',
      null,
      expect.objectContaining({
        dedupeKey: 'reservation-denied:reservation-1',
        dedupeWindowMs: 120000,
      })
    )
    expect(addTemporaryNotification).toHaveBeenNthCalledWith(
      2,
      'error',
      '❌ Reservation denied by your institution (request expired).',
      null,
      expect.objectContaining({
        dedupeKey: 'reservation-denied:reservation-2',
        dedupeWindowMs: 120000,
      })
    )
    expect(addTemporaryNotification).toHaveBeenNthCalledWith(
      3,
      'error',
      '❌ Reservation denied: LAB token payment failed.',
      null,
      expect.objectContaining({
        dedupeKey: 'reservation-denied:reservation-3',
        dedupeWindowMs: 120000,
      })
    )
    expect(addTemporaryNotification).toHaveBeenNthCalledWith(
      4,
      'error',
      '❌ Reservation denied.',
      null,
      expect.objectContaining({
        dedupeKey: 'reservation-denied:reservation-4',
        dedupeWindowMs: 120000,
      })
    )
    expect(addTemporaryNotification).toHaveBeenNthCalledWith(
      5,
      'error',
      '❌ Reservation denied.',
      null,
      expect.objectContaining({
        dedupeKey: 'reservation-denied:reservation-5',
        dedupeWindowMs: 120000,
      })
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
      expect.stringContaining('Preparing reservation request'),
      null,
      expect.objectContaining({
        dedupeKey: 'reservation-progress:9:1700000000:prepare',
        dedupeWindowMs: 20000,
        duration: 7000,
      })
    )

    expect(addTemporaryNotification).toHaveBeenNthCalledWith(
      2,
      'pending',
      expect.stringContaining('security key/passkey'),
      null,
      expect.objectContaining({
        dedupeKey: 'reservation-progress:9:1700000000:authorize',
        dedupeWindowMs: 20000,
        duration: 9000,
      })
    )

    expect(addTemporaryNotification).toHaveBeenNthCalledWith(
      3,
      'pending',
      expect.stringContaining('Reservation request sent'),
      null,
      expect.objectContaining({
        dedupeKey: 'reservation-progress:9:1700000000:submitted',
        dedupeWindowMs: 20000,
      })
    )
  })

  test('emits authorization-cancelled toast with stable dedupe key', () => {
    notifyReservationAuthorizationCancelled(addTemporaryNotification)

    expect(addTemporaryNotification).toHaveBeenCalledWith(
      'warning',
      'Reservation authorization was cancelled.',
      null,
      expect.objectContaining({
        dedupeKey: 'reservation-authorization-cancelled',
        dedupeWindowMs: 20000,
      })
    )
  })

  test('emits wallet-related toasts through the same notification contract', () => {
    notifyReservationWalletDisconnected(addTemporaryNotification)
    notifyReservationWalletUnsupportedNetwork(addTemporaryNotification, 'Sepolia')
    notifyReservationWalletInvalidCost(addTemporaryNotification)
    notifyReservationWalletInsufficientTokens(addTemporaryNotification, '100', '50')
    notifyReservationWalletApprovalPending(addTemporaryNotification)
    notifyReservationWalletApprovalSuccess(addTemporaryNotification)
    notifyReservationWalletApprovalRejected(addTemporaryNotification)
    notifyReservationWalletSlotUnavailable(addTemporaryNotification, { labId: 1, start: 1000 })
    notifyReservationWalletTransactionRejected(addTemporaryNotification)
    notifyReservationWalletTimeslotConflict(addTemporaryNotification, { labId: 1, start: 1000 })

    const calls = addTemporaryNotification.mock.calls
    expect(calls).toHaveLength(10)
    expect(calls[0][3]).toEqual(expect.objectContaining({ dedupeKey: 'reservation-wallet-not-connected' }))
    expect(calls[1][3]).toEqual(expect.objectContaining({ dedupeKey: 'reservation-wallet-unsupported-network:sepolia' }))
    expect(calls[2][3]).toEqual(expect.objectContaining({ dedupeKey: 'reservation-wallet-invalid-cost' }))
    expect(calls[3][3]).toEqual(expect.objectContaining({ dedupeKey: 'reservation-wallet-insufficient-tokens' }))
    expect(calls[4][3]).toEqual(expect.objectContaining({ dedupeKey: 'reservation-wallet-approval-pending', duration: 8000 }))
    expect(calls[5][3]).toEqual(expect.objectContaining({ dedupeKey: 'reservation-wallet-approval-success' }))
    expect(calls[6][3]).toEqual(expect.objectContaining({ dedupeKey: 'reservation-wallet-approval-rejected' }))
    expect(calls[7][3]).toEqual(expect.objectContaining({ dedupeKey: 'reservation-wallet-slot-unavailable:1:1000' }))
    expect(calls[8][3]).toEqual(expect.objectContaining({ dedupeKey: 'reservation-wallet-transaction-rejected' }))
    expect(calls[9][3]).toEqual(expect.objectContaining({ dedupeKey: 'reservation-wallet-timeslot-conflict:1:1000' }))
  })

  test('emits remaining booking toasts through unified helper', () => {
    notifyReservationTxReverted(addTemporaryNotification)
    notifyReservationOnChainRequested(addTemporaryNotification, 'reservation-xyz')
    notifyReservationMissingCredential(addTemporaryNotification)

    expect(addTemporaryNotification).toHaveBeenNthCalledWith(
      1,
      'error',
      expect.any(String),
      null,
      expect.objectContaining({ dedupeKey: 'reservation-tx-reverted' })
    )
    expect(addTemporaryNotification).toHaveBeenNthCalledWith(
      2,
      'success',
      expect.any(String),
      null,
      expect.objectContaining({ dedupeKey: 'reservation-onchain-requested:reservation-xyz' })
    )
    expect(addTemporaryNotification).toHaveBeenNthCalledWith(
      3,
      'warning',
      expect.any(String),
      null,
      expect.objectContaining({ dedupeKey: 'reservation-webauthn-missing-credential' })
    )
  })

  test('emits SSO request-registered fallback toast with pending-onchain dedupe key', () => {
    notifyReservationRequestAcceptedAwaitingOnChain(addTemporaryNotification, 'reservation-sso-1')

    expect(addTemporaryNotification).toHaveBeenCalledWith(
      'pending',
      'Reservation request accepted. Waiting for on-chain registration...',
      null,
      expect.objectContaining({
        dedupeKey: 'reservation-onchain-pending:reservation-sso-1',
        dedupeWindowMs: 120000,
      })
    )
  })

  test('allows pending and success on-chain toasts to be displayed independently', () => {
    notifyReservationRequestAcceptedAwaitingOnChain(addTemporaryNotification, 'reservation-sso-2')
    notifyReservationOnChainRequested(addTemporaryNotification, 'reservation-sso-2')

    expect(addTemporaryNotification).toHaveBeenNthCalledWith(
      1,
      'pending',
      'Reservation request accepted. Waiting for on-chain registration...',
      null,
      expect.objectContaining({
        dedupeKey: 'reservation-onchain-pending:reservation-sso-2',
      })
    )

    expect(addTemporaryNotification).toHaveBeenNthCalledWith(
      2,
      'success',
      expect.stringContaining('Reservation request registered on-chain'),
      null,
      expect.objectContaining({
        dedupeKey: 'reservation-onchain-requested:reservation-sso-2',
      })
    )
  })

  test('no-ops when callback is not provided', () => {
    expect(() => notifyReservationConfirmed(undefined, 'reservation-1')).not.toThrow()
    expect(() => notifyReservationWalletTransactionRejected(null)).not.toThrow()
  })
})
