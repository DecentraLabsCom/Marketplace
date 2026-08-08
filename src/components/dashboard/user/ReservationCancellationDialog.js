import PropTypes from 'prop-types'
import Modal from '@/components/ui/Modal'
import {
  getCancellationCreditReturnLabel,
  getCancellationRefundExpiryStatus,
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

const formatRefundDestination = (address) => address || 'Unavailable'

const formatSourceExpiry = (preview) => {
  if (!preview?.sourceCreditExpiryKnown) return 'Unavailable'
  if (preview.sourceCreditExpiry === null) return 'No expiry recorded'
  return formatTimestamp(preview.sourceCreditExpiry)
}

export default function ReservationCancellationDialog({
  isOpen,
  lab,
  booking,
  isProcessing = false,
  onClose,
  onConfirm,
}) {
  const policyBooking = {
    ...booking,
    resourceType: booking?.resourceType ?? booking?.labDetails?.resourceType ?? lab?.resourceType,
  }
  const creditReturn = getCancellationCreditReturnLabel(policyBooking)
  const preview = getCancellationPreview(policyBooking)
  const hasChargedReservation = Number(policyBooking?.status) === 1 || Number(preview?.status) === 1
  const expiryStatus = getCancellationRefundExpiryStatus(preview)
  const hasOnChainPreview = preview?.source === 'on-chain'
  const sourceLabel = hasOnChainPreview
    ? `on-chain policy v${preview.policyVersion}`
    : preview?.source === 'local-fallback'
      ? 'Legacy local diagnostic estimate'
      : 'Unavailable'
  const isConfirmationBlocked = hasChargedReservation && (
    !hasOnChainPreview
    || preview.cancellable !== true
  )
  const diagnosticCreditReturn = hasChargedReservation && !hasOnChainPreview
    ? `Diagnostic estimate only: ${creditReturn}`
    : creditReturn

  let blockingMessage = null
  if (hasChargedReservation && !hasOnChainPreview) {
    blockingMessage = 'The on-chain cancellation preview is unavailable. The local estimate is diagnostic only; confirmation is disabled.'
  } else if (hasOnChainPreview && preview.cancellable !== true) {
    blockingMessage = 'The on-chain policy does not allow this cancellation. Refresh the reservation details before trying again.'
  }

  const advisoryMessage = hasOnChainPreview && preview.cancellable === true && expiryStatus === 'expired'
    ? 'The refund source credits may be partially or fully expired. This is advisory only; the on-chain preview still allows cancellation.'
    : null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Cancel reservation?"
      size="md"
    >
      <div className="space-y-4 text-gray-700">
        <p>This action cannot be undone.</p>
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
            <dd>{diagnosticCreditReturn}</dd>
          </div>
          {preview && (
            <>
              <div>
                <dt className="font-semibold">Preview source:</dt>
                <dd>{sourceLabel}</dd>
              </div>
              <div>
                <dt className="font-semibold">Policy:</dt>
                <dd>{hasOnChainPreview ? `on-chain policy v${preview.policyVersion}` : 'Unavailable (legacy local diagnostic)'}</dd>
              </div>
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
              <div>
                <dt className="font-semibold">Cancellation cutoff:</dt>
                <dd>{formatTimestamp(preview.cancellationCutoff)}</dd>
              </div>
              {preview.spendingPeriodStart && preview.spendingPeriodEnd && (
                <div>
                  <dt className="font-semibold">Spending period:</dt>
                  <dd>
                    {formatTimestamp(preview.spendingPeriodStart)} – {formatTimestamp(preview.spendingPeriodEnd)}
                  </dd>
                </div>
              )}
              {(!preview.spendingPeriodStart || !preview.spendingPeriodEnd) && (
                <div>
                  <dt className="font-semibold">Spending period:</dt>
                  <dd>Unavailable</dd>
                </div>
              )}
              <div>
                <dt className="font-semibold">Allocation count:</dt>
                <dd>{preview.allocationCount ?? 'Unavailable'}</dd>
              </div>
              <div>
                <dt className="font-semibold">Refund source expiry:</dt>
                <dd>{formatSourceExpiry(preview)}</dd>
              </div>
            </>
          )}
          <div>
            <dt className="font-semibold">Destination:</dt>
            <dd>
              {hasChargedReservation
                ? formatRefundDestination(preview?.refundDestination)
                : 'No credit refund'}
            </dd>
          </div>
        </dl>
        {blockingMessage && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
            {blockingMessage}
          </p>
        )}
        {advisoryMessage && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="status">
            {advisoryMessage}
          </p>
        )}
        <p className="text-sm">Access will no longer be available for this time window.</p>
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
            disabled={isProcessing || isConfirmationBlocked}
            title={blockingMessage || undefined}
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
