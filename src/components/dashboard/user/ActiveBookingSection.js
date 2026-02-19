/**
 * Component for displaying active/next booking status from parent-computed data.
 */
import React from 'react';
import PropTypes from 'prop-types';
import ActiveLabCard from './ActiveLabCard';

/**
 * Renders the active booking section from precomputed bookings.
 * @param {Object} props - Component props
 * @param {Object|null} props.activeBooking - Current active booking
 * @param {Object|null} props.nextBooking - Next upcoming booking when no active booking exists
 * @param {string|null} props.userAddress - User wallet address
 * @returns {JSX.Element} Active booking section
 */
export default function ActiveBookingSection({
  activeBooking = null,
  nextBooking = null,
  userAddress,
  onBookingAction = null,
  cancellationStates = new Map()
}) {
  const hasActiveBooking = Boolean(activeBooking);
  const targetBooking = activeBooking || nextBooking;
  const labData = targetBooking?.labDetails || null;

  const displayedReservationKey = targetBooking?.reservationKey;
  const cancellationState = displayedReservationKey && cancellationStates instanceof Map
    ? cancellationStates.get(displayedReservationKey)
    : null;
  const bookingStatus = Number.parseInt(targetBooking?.status, 10);
  const canTriggerBookingAction =
    typeof onBookingAction === 'function' &&
    Boolean(displayedReservationKey) &&
    (bookingStatus === 0 || bookingStatus === 1 || bookingStatus === 2);

  const getBookingTimes = (booking) => {
    if (!booking?.start || !booking?.end) return { start: null, end: null };

    const parseTimestamp = (timestamp) => {
      if (!timestamp) return null;
      const parsed = parseInt(timestamp);
      if (isNaN(parsed) || parsed <= 0) return null;
      const date = new Date(parsed * 1000);
      return date.getTime() && !isNaN(date.getTime()) ? date : null;
    };

    const startDate = parseTimestamp(booking.start);
    const endDate = parseTimestamp(booking.end);

    if (!startDate || !endDate) return { start: null, end: null };

    return {
      start: `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`,
      end: `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`
    };
  };

  return (
    <div className="border shadow text-white rounded p-6 mb-1 h-full">
      <div className="flex flex-col h-full">
        {hasActiveBooking && labData ? (
          <h2 className="text-2xl font-semibold mb-4 text-white text-center">
            Active now: {labData.name}
          </h2>
        ) : nextBooking && labData ? (
          <h2 className="text-2xl font-semibold mb-4 text-white text-center">
            Next: {labData.name}
          </h2>
        ) : null}

        <div className="w-full">
          {hasActiveBooking && labData ? (
            <ActiveLabCard
              lab={labData}
              booking={activeBooking}
              userAddress={userAddress}
              isActive={true}
              bookingTimes={getBookingTimes(activeBooking)}
              actionLabel="Request for Refund"
              onBookingAction={canTriggerBookingAction ? onBookingAction : null}
              actionState={cancellationState || null}
            />
          ) : nextBooking && labData ? (
            <ActiveLabCard
              lab={labData}
              booking={nextBooking}
              userAddress={userAddress}
              isActive={false}
              bookingTimes={getBookingTimes(nextBooking)}
              actionLabel="Cancel Booking"
              onBookingAction={canTriggerBookingAction ? onBookingAction : null}
              actionState={cancellationState || null}
            />
          ) : (
            <span className="text-gray-300 text-center">
              No upcoming or active lab
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

ActiveBookingSection.propTypes = {
  activeBooking: PropTypes.object,
  nextBooking: PropTypes.object,
  userAddress: PropTypes.string,
  onBookingAction: PropTypes.func,
  cancellationStates: PropTypes.instanceOf(Map)
};
