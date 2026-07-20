import PropTypes from 'prop-types'
import Modal from '@/components/ui/Modal'
import {
  getCancellationCreditReturnLabel,
  getCancellationPreview,
} from '@/utils/booking/cancellationSummary'
import { formatRawCredits } from '@/utils/blockchain/creditUnits'

const formatReservationWindow = (booking) => {
  const start = Number(booking?.start)
  const end = Number(booking?.end)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= start) {
    return booking?.date || 'Time window unavailable'
  }

  const startDate = new Date(start * 1000)
  const endDate = new Date(end * 1000)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return 'Time window unavailable'
  }

  const date = startDate.toLocaleDateString('en-CA')
  const startTime = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const endTime = endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return `${date}, ${startTime}–${endTime}`
}

const formatTimestamp = (timestamp) => {
  if (!timestamp) return 'Unavailable'
  const date = new Date(Number(timestamp) * 1000)
  return Number.isNaN(date.getTime()) ? 'Unavailable' : date.toLocaleString()
}

export default function ReservationCancellationDialog({
  isOpen,
  lab,
  booking,
  isProcessing = false,
  onClose,
  onConfirm,
}) {
  const creditReturn = getCancellationCreditReturnLabel(booking)
  const preview = getCancellationPreview(booking)
  const hasChargedReservation = Number(preview?.status) === 1
  const sourceLotLabel = preview?.allocations?.length
    ? `${preview.allocations.length} lot${preview.allocations.length === 1 ? '' : 's'} recorded`
    : hasChargedReservation
      ? 'Unavailable for legacy reservation'
      : 'No charged lots'

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Cancel reservation?"
      size="md"
    >
      <div className="space-y-4 text-gray-700">
        <p>This action cannot be undone from the Marketplace.</p>
        <dl className="space-y-2 rounded-lg bg-gray-50 p-3 text-sm">
          <div>
            <dt className="font-semibold">Reservation:</dt>
            <dd>{lab?.name || `Lab ${booking?.labId || 'unavailable'}`}</dd>
          </div>
          <div>
            <dt className="font-semibold">Reservation ID:</dt>
            <dd className="break-all font-mono text-xs">{booking?.reservationKey || 'Unavailable'}</dd>
          </div>
          <div>
            <dt className="font-semibold">Time window:</dt>
            <dd>{formatReservationWindow(booking)}</dd>
          </div>
          <div>
            <dt className="font-semibold">Credits to return:</dt>
            <dd>{creditReturn}</dd>
          </div>
          {preview && (
            <>
              <div>
                <dt className="font-semibold">Cancellation fee:</dt>
                <dd>
                  {formatRawCredits(preview.totalFeeRaw)} credits
                  {preview.minimumFeeApplied ? ' (minimum applies)' : ''}
                </dd>
              </div>
              {hasChargedReservation && (
                <div>
                  <dt className="font-semibold">Provider fee:</dt>
                  <dd>{formatRawCredits(preview.providerFeeRaw)} credits</dd>
                </div>
              )}
              {preview.cancellationCutoff && (
                <div>
                  <dt className="font-semibold">Cancellation cutoff:</dt>
                  <dd>{formatTimestamp(preview.cancellationCutoff)}</dd>
                </div>
              )}
              {preview.spendingPeriodStart && preview.spendingPeriodEnd && (
                <div>
                  <dt className="font-semibold">Spending period:</dt>
                  <dd>
                    {formatTimestamp(preview.spendingPeriodStart)} – {formatTimestamp(preview.spendingPeriodEnd)}
                  </dd>
                </div>
              )}
              <div>
                <dt className="font-semibold">Source credit lots:</dt>
                <dd>{sourceLotLabel}</dd>
              </div>
              <div>
                <dt className="font-semibold">Policy version:</dt>
                <dd>v{preview.policyVersion} ({preview.source === 'on-chain' ? 'on-chain contract' : 'local fallback'})</dd>
              </div>
            </>
          )}
          <div>
            <dt className="font-semibold">Destination:</dt>
            <dd>Institutional credit account</dd>
          </div>
        </dl>
        <p className="text-sm">Access will no longer be available for this time window.</p>
        <p className="text-xs text-gray-500">
          {preview?.source === 'on-chain'
            ? 'Values are read from the current contract policy and verified again by the institutional backend.'
            : 'Legacy reservation data uses the current policy fallback; the institutional backend verifies the final amount.'}
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-100"
            onClick={onClose}
            disabled={isProcessing}
          >
            Keep reservation
          </button>
          <button
            type="button"
            className="rounded bg-[#a87583] px-4 py-2 text-sm font-medium text-white hover:bg-[#8a5c66] disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onConfirm}
            disabled={isProcessing}
          >
            {isProcessing ? 'Cancelling...' : 'Cancel reservation'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

ReservationCancellationDialog.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  lab: PropTypes.object,
  booking: PropTypes.object,
  isProcessing: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
}
