import {
  notifyUserDashboardAlreadyCanceled,
  notifyUserDashboardCancellationConfirmed,
  notifyUserDashboardCancellationProcessing,
  notifyUserDashboardCancellationFailed,
  notifyUserDashboardCancellationRejected,
  notifyUserDashboardCancellationSubmitted,
  notifyUserDashboardMissingBookingSelection,
  notifyUserDashboardWalletRequired,
  userDashboardToastIds,
} from '../userDashboardToasts'

describe('userDashboardToasts', () => {
  const addTemporaryNotification = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('builds stable dedupe keys', () => {
    expect(userDashboardToastIds.missingBookingSelection()).toBe('user-dashboard-missing-booking-selection')
    expect(userDashboardToastIds.cancellationProcessing('res-123')).toBe('user-dashboard-cancellation-processing:res-123')
    expect(userDashboardToastIds.cancellationSubmitted('res-123')).toBe('user-dashboard-cancellation-submitted:res-123')
    expect(userDashboardToastIds.cancellationConfirmed('res-123')).toBe('user-dashboard-cancellation-confirmed:res-123')
    expect(userDashboardToastIds.cancellationFailed('res-123')).toBe('user-dashboard-cancellation-failed:res-123')
    expect(userDashboardToastIds.cancellationFailed()).toBe('user-dashboard-cancellation-failed:unknown')
  })

  test('emits all dashboard toasts with unified notification signature', () => {
    notifyUserDashboardMissingBookingSelection(addTemporaryNotification)
    notifyUserDashboardAlreadyCanceled(addTemporaryNotification)
    notifyUserDashboardWalletRequired(addTemporaryNotification)
    notifyUserDashboardCancellationProcessing(addTemporaryNotification, 'res-123', { isRequest: false })
    notifyUserDashboardCancellationSubmitted(addTemporaryNotification, 'res-123', { isRequest: true })
    notifyUserDashboardCancellationConfirmed(addTemporaryNotification, 'res-123', { isRequest: false })
    notifyUserDashboardCancellationRejected(addTemporaryNotification)
    notifyUserDashboardCancellationFailed(addTemporaryNotification, 'res-123')

    const calls = addTemporaryNotification.mock.calls
    expect(calls).toHaveLength(8)
    expect(calls[0]).toEqual([
      'error',
      'No booking selected or missing reservation key.',
      null,
      expect.objectContaining({
        dedupeKey: 'user-dashboard-missing-booking-selection',
        dedupeWindowMs: 20000,
      }),
    ])
    expect(calls[1][3]).toEqual(expect.objectContaining({ dedupeKey: 'user-dashboard-already-canceled', dedupeWindowMs: 20000 }))
    expect(calls[2][3]).toEqual(expect.objectContaining({ dedupeKey: 'user-dashboard-wallet-required', dedupeWindowMs: 20000 }))
    expect(calls[3]).toEqual([
      'pending',
      'Cancelling booking...',
      null,
      expect.objectContaining({
        dedupeKey: 'user-dashboard-cancellation-processing:res-123',
        dedupeWindowMs: 20000,
      }),
    ])
    expect(calls[4]).toEqual([
      'pending',
      'Cancellation request sent. Waiting for on-chain confirmation...',
      null,
      expect.objectContaining({
        dedupeKey: 'user-dashboard-cancellation-submitted:res-123',
        dedupeWindowMs: 20000,
      }),
    ])
    expect(calls[5]).toEqual([
      'success',
      'Booking cancelled successfully.',
      null,
      expect.objectContaining({
        dedupeKey: 'user-dashboard-cancellation-confirmed:res-123',
        dedupeWindowMs: 120000,
      }),
    ])
    expect(calls[6][3]).toEqual(expect.objectContaining({ dedupeKey: 'user-dashboard-cancellation-rejected', dedupeWindowMs: 20000 }))
    expect(calls[7][3]).toEqual(expect.objectContaining({ dedupeKey: 'user-dashboard-cancellation-failed:res-123', dedupeWindowMs: 20000 }))
  })

  test('no-ops when callback is not provided', () => {
    expect(() => notifyUserDashboardWalletRequired(undefined)).not.toThrow()
    expect(() => notifyUserDashboardCancellationFailed(null)).not.toThrow()
  })
})
