import React from 'react'
import PropTypes from 'prop-types'
import Link from 'next/link'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
    getBookingStatusDisplay,
    isCancelledBooking,
    isConfirmedBooking,
    isPendingBooking
} from '@/utils/booking/bookingStatus'
import devLog from '@/utils/dev/logger'

/**
 * Individual booking item component for user dashboards and booking lists
 * Displays booking information with status, cancellation, and refund options
 * @param {Object} props
 * @param {Object} props.lab - Lab object containing id, name, provider info
 * @param {Object} props.booking - Booking object with status, date, times, errors
 * @param {string|number} props.startTime - Booking start time
 * @param {string|number} props.endTime - Booking end time
 * @param {Function} props.onCancel - Handler for canceling booking
 * @param {Function} props.onRefund - Handler for requesting refund
 * @param {Function} props.onConfirmRefund - Handler for confirming refund request
 * @param {boolean} props.isModalOpen - Whether confirmation modal is open
 * @param {Function} props.closeModal - Handler for closing confirmation modal
 * @param {Function} props.onClearError - Handler for clearing booking errors
 * @returns {JSX.Element} Booking item with status display and action buttons
 */
const LabBookingItem = React.memo(function LabBookingItem({ 
    lab = {},
    booking = {},
    startTime = null,
    endTime = null,
    onCancel = null,
    onRefund = null,
    onConfirmRefund = null,
    isModalOpen = false,
    closeModal = null,
    onClearError = null,
    cancelState = null,
    isSSOUser = false,
    userInstitutionWallet = null
}) {
    const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
    const normalizeAddress = (value) => (typeof value === 'string' ? value.toLowerCase() : '');
    const hasNonZeroAddress = (value) => {
      const normalized = normalizeAddress(value);
      return Boolean(normalized) && normalized !== ZERO_ADDRESS;
    };
    const isZeroLike = (value) => {
      if (value === null || value === undefined || value === '') return false;
      try {
        return BigInt(value) === 0n;
      } catch {
        const numeric = Number(value);
        return Number.isFinite(numeric) && numeric === 0;
      }
    };

    // Determine status display using utility function
    const statusDisplay = getBookingStatusDisplay(booking);
    const parseUnixTime = (value) => {
      const num = Number(value);
      return Number.isFinite(num) && num > 0 ? num : null;
    };
    const now = Math.floor(Date.now() / 1000);
    const startTimeUnix = parseUnixTime(booking?.start ?? booking?.startTime);
    const endTimeUnix = parseUnixTime(booking?.end ?? booking?.endTime);

    const isCancelled = isCancelledBooking(booking);
    const canCancel = !isCancelled && (isPendingBooking(booking) || isConfirmedBooking(booking));
    const isInUse = booking.status === "2" || booking.status === 2;
    const isTemporallyActive =
      startTimeUnix !== null &&
      endTimeUnix !== null &&
      startTimeUnix <= now &&
      now < endTimeUnix;
    const isBookingInUseNow = (isConfirmedBooking(booking) || isInUse) && isTemporallyActive;
    const effectiveStatusDisplay = isBookingInUseNow
      ? {
          text: "In Use",
          className: "bg-booking-used-bg text-booking-used-text border-booking-used-border",
          icon: "✅",
        }
      : statusDisplay;
    const statusIcon = effectiveStatusDisplay?.icon;
    const shouldRenderIcon = statusIcon && typeof statusIcon === 'object';
    const normalizedCollector = normalizeAddress(booking.collectorInstitution);
    const normalizedPayer = normalizeAddress(booking.payerInstitution);
    const normalizedUserInstitution = normalizeAddress(userInstitutionWallet);
    const isSameInstitutionBooking = Boolean(
      isSSOUser &&
      hasNonZeroAddress(normalizedCollector) &&
      (
        (hasNonZeroAddress(normalizedUserInstitution) && normalizedCollector === normalizedUserInstitution) ||
        (hasNonZeroAddress(normalizedPayer) && normalizedCollector === normalizedPayer)
      )
    );
    const isFreeReservation = isZeroLike(booking.price);
    const shouldUseRefundAction =
      typeof onCancel === "function" &&
      typeof onRefund === "function" &&
      isBookingInUseNow;
    const canRefund = Boolean(
      typeof onRefund === "function" &&
      booking.reservationKey &&
      !isCancelled &&
      !isFreeReservation &&
      !isSameInstitutionBooking &&
      (isConfirmedBooking(booking) || isInUse) &&
      (shouldUseRefundAction || typeof onCancel !== "function")
    );
    const showCancelButton = typeof onCancel === "function" && canCancel && !shouldUseRefundAction;
    const isCancelling = Boolean(cancelState?.isBusy);
    const cancelLabel = cancelState?.label || ((booking.status === "1" || booking.status === 1) ? "Cancel Booking" : "Cancel Request");
    const refundLabel = shouldUseRefundAction ? "Request for Refund" : "Apply for Refund";

    return (
        <li className={`flex flex-col items-center border rounded-lg p-4 mb-4 bg-white shadow ${booking.hasCancellationError ? 'border-red-500 bg-red-50' : ''}`}>
            {booking.hasCancellationError && (
                <div className="w-full mb-2 p-2 bg-red-100 border border-red-300 rounded text-red-700 text-sm flex justify-between items-center">
                    <span>⚠️ Cancellation failed. Please try again.</span>
                    {onClearError && (
                        <button 
                            onClick={() => onClearError(booking.reservationKey)}
                            className="text-red-500 hover:text-red-700 font-bold text-lg leading-none"
                            title="Clear error"
                        >
                            ×
                        </button>
                    )}
                </div>
            )}
            <div className="w-full flex flex-col md:flex-row items-center justify-between">
                <div className="flex-1">
                <Link
                    href={`/lab/${lab.id}`}
                    className="text-lg font-semibold text-brand hover:underline"
                >
                    {lab.name}
                </Link>
                <div className="text-gray-600 text-sm mt-1">
                    {booking?.date} {startTime && endTime ? `${startTime} - ${endTime}` : 'Time not available'}
                </div>
                <div className="text-gray-500 text-xs">
                    Provider: {lab.provider}
                </div>
                </div>
                <div className="flex flex-col md:flex-row gap-2 mt-2 md:mt-0 items-center">
                {/* Reservation Status */}
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${effectiveStatusDisplay.className}`}>
                    <span className="mr-1">
                      {shouldRenderIcon ? (
                        <FontAwesomeIcon icon={statusIcon} className="animate-spin" />
                      ) : (
                        statusIcon
                      )}
                    </span>
                    {effectiveStatusDisplay.text}
                </span>
                {/* Show cancel button for booked or pending reservations (not canceled) */}
                {showCancelButton && (
                    <button
                        onClick={() => {
                            // Log critical action for debugging
                            if (isCancelling) return;
                            devLog.log('Cancel booking action:', { labId: lab.id, bookingStatus: booking.status });
                            onCancel(booking);
                        }}
                        disabled={isCancelling}
                        className={`text-white px-3 py-1 rounded text-sm inline-flex items-center justify-center gap-2 ${
                          isCancelling
                            ? 'bg-gray-500 cursor-not-allowed'
                            : 'bg-[#a87583] hover:bg-[#8a5c66]'
                        }`}
                        aria-busy={isCancelling}
                    >
                        {isCancelling && <div className="spinner spinner-sm border-white" />}
                        {cancelLabel}
                    </button>
                )}
                {/* Only show refund button for reservations that have a key and are not canceled */}
                {canRefund && (
                    <button
                        onClick={() => onRefund(lab.id, booking)}
                        className="bg-[#bcc4fc] text-white px-3 py-1 rounded hover:bg-[#aab8e6] text-sm"
                    >
                        {refundLabel}
                    </button>
                )}
                </div>
            </div>
            {isModalOpen && (
                <ConfirmModal
                    isOpen={isModalOpen}
                    onClose={closeModal}
                    onContinue={() => {
                        if (typeof onConfirmRefund === "function") {
                            devLog.log('Confirming refund request');
                            onConfirmRefund();
                        } else {
                            devLog.error('No refund confirm function available');
                        }
                        // Don't call closeModal here - let the parent handle it
                    }}
                />
            )}
        </li>
    );
});

LabBookingItem.propTypes = {
    lab: PropTypes.shape({
        id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
        name: PropTypes.string,
        provider: PropTypes.string
    }),
    booking: PropTypes.shape({
        id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
        status: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
        hasEnded: PropTypes.bool,
        requestDate: PropTypes.string,
        endTime: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
    }),
    startTime: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    endTime: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    onCancel: PropTypes.func,
    onRefund: PropTypes.func,
    onConfirmRefund: PropTypes.func,
    isModalOpen: PropTypes.bool,
    closeModal: PropTypes.func,
    onClearError: PropTypes.func,
    cancelState: PropTypes.shape({
        isBusy: PropTypes.bool,
        label: PropTypes.string
    }),
    isSSOUser: PropTypes.bool,
    userInstitutionWallet: PropTypes.string
}

export default LabBookingItem;
