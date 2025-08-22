/**
 * Bookings list component for user dashboard
 * Displays upcoming and past bookings in separate sections
 */
import React from 'react';
import PropTypes from 'prop-types';
import LabBookingItem from '@/components/dashboard/user/LabBookingItem';
import { isCancelledBooking, isPendingBooking } from '@/utils/booking/bookingStatus';
import { DashboardSectionSkeleton } from '@/components/skeletons';

/**
 * Renders a list of bookings (upcoming or past) with proper formatting
 * @param {Object} props - Component props
 * @param {Array} props.bookings - Array of booking objects
 * @param {Date} props.currentTime - Current time for filtering
 * @param {boolean} props.isLoading - Loading state
 * @param {string} props.type - Type of bookings ('upcoming' or 'past')
 * @param {Function} props.onCancel - Callback for booking cancellation (upcoming only)
 * @param {Function} props.onRefund - Callback for refund request (past only)
 * @param {Function} props.onConfirmRefund - Callback for refund confirmation (past only)
 * @param {Function} props.onClearError - Callback to clear cancellation errors
 * @param {boolean} props.isModalOpen - Whether refund modal is open
 * @param {Function} props.closeModal - Callback to close modal
 * @param {Set} props.failedCancellations - Set of failed cancellation keys
 * @param {Object|null} props.selectedBooking - Currently selected booking for modal
 * @param {string|null} props.selectedLabId - Currently selected lab ID for modal
 * @returns {JSX.Element} Bookings list component
 */
export default function BookingsList({ 
  bookings = [], 
  currentTime, 
  isLoading, 
  type = 'upcoming',
  onCancel,
  onRefund,
  onConfirmRefund,
  onClearError,
  isModalOpen,
  closeModal,
  failedCancellations = new Set(),
  selectedBooking = null,
  selectedLabId = null
}) {
  const isUpcoming = type === 'upcoming';
  const title = isUpcoming ? 'Upcoming Bookings' : 'Past bookings';
  const emptyMessage = isUpcoming ? 'No upcoming bookings found.' : 'No past bookings found.';

  /**
   * Filters bookings based on type (upcoming/past) and time
   * @param {Array} bookings - Array of bookings to filter
   * @returns {Array} Filtered bookings
   */
  const filterBookings = (bookings) => {
    if (!currentTime || !bookings.length) {
      return [];
    }

    const filtered = bookings.filter(booking => {
      if (!booking.start || !booking.end) {
        return false;
      }
  // Exclude cancelled bookings from all lists
  const isCancelled = isCancelledBooking(booking);
  if (isCancelled) return false;
      
      const endDateTime = new Date(parseInt(booking.end) * 1000);
      
      if (isUpcoming) {
        const isUpcomingBooking = endDateTime.getTime() > currentTime.getTime();
        return isUpcomingBooking;
      } else {
        // For past bookings, only include confirmed ones (not PENDING)
        const hasReservationKey = booking.reservationKey;
        const wasPending = isPendingBooking(booking);
        const isPastBooking = endDateTime.getTime() <= currentTime.getTime() && hasReservationKey && !wasPending;
        return isPastBooking;
      }
    });

    return filtered;
  };

  /**
   * Enhances booking with lab data and time formatting
   * @param {Object} booking - Booking object to enhance
   * @returns {Object} Enhanced booking object
   */
  const enhanceBooking = (booking) => {
    // Use labDetails from composed hook
    const lab = booking.labDetails || { name: `Lab ${booking.labId}`, id: booking.labId };
    const startDateTime = new Date(parseInt(booking.start) * 1000);
    
    // Format date for display (YYYY-MM-DD format)
    const formattedDate = startDateTime.toLocaleDateString('en-CA');
    
    return {
      ...booking,
      lab: lab,
      startDateTime,
      date: formattedDate,
      // Add visual feedback for failed cancellations (upcoming only)
      hasCancellationError: isUpcoming ? failedCancellations.has(booking.reservationKey) : false
    };
  };

  /**
   * Formats booking times for display
   * @param {Object} booking - Booking object with start/end timestamps
   * @returns {Object} Object with formatted start and end times
   */
  const formatBookingTimes = (booking) => {
    if (!booking?.start || !booking?.end) {
      return { startTime: null, endTime: null };
    }

    const startDateObj = new Date(parseInt(booking.start) * 1000);
    const endDateObj = new Date(parseInt(booking.end) * 1000);

    if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
      return { startTime: null, endTime: null };
    }

    const startHours = String(startDateObj.getHours()).padStart(2, '0');
    const startMinutes = String(startDateObj.getMinutes()).padStart(2, '0');
    const startTime = `${startHours}:${startMinutes}`;
    
    const endHours = String(endDateObj.getHours()).padStart(2, '0');
    const endMinutes = String(endDateObj.getMinutes()).padStart(2, '0');
    const endTime = `${endHours}:${endMinutes}`;

    return { startTime, endTime };
  };

  const filteredBookings = filterBookings(bookings);
  const enhancedBookings = filteredBookings
    .map(enhanceBooking)
    .filter(booking => booking.lab) // Only include bookings with valid lab data
    .sort((a, b) => {
      // Upcoming: earliest first, Past: most recent first
      const multiplier = isUpcoming ? 1 : -1;
      return multiplier * (a.startDateTime.getTime() - b.startDateTime.getTime());
    });

  return (
    <div className="min-[1280px]:w-1/2 flex flex-col h-full min-h-[350px]">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-semibold text-center flex-1">
          {title}
        </h2>
      </div>
      
      <ul className='w-full flex-1'>
        {isLoading ? (
          <DashboardSectionSkeleton title={false} />
        ) : (
          currentTime && enhancedBookings.length > 0 ? (
            enhancedBookings.map((booking) => {
              const { startTime, endTime } = formatBookingTimes(booking);
              const bookingKey = `${String(booking.lab.id)}-${booking.reservationKey || booking.id}-${booking.start}`;
              
              const itemProps = {
                lab: booking.lab,
                booking: booking,
                startTime,
                endTime,
                isModalOpen: false,
                closeModal
              };

              // Add type-specific props
              if (isUpcoming) {
                itemProps.onCancel = onCancel;
                itemProps.onClearError = onClearError;
              } else {
                itemProps.onRefund = onRefund;
                itemProps.onConfirmRefund = onConfirmRefund;
                itemProps.isModalOpen = isModalOpen === 'refund' && 
                  selectedLabId === booking.lab.id && 
                  selectedBooking?.reservationKey === booking.reservationKey;
              }

              return <LabBookingItem key={bookingKey} {...itemProps} />;
            })
          ) : (
            <li className="text-center text-gray-500 py-8">
              {emptyMessage}
            </li>
          )
        )}
        {!currentTime && !isLoading && (
          <li className="text-center text-gray-500">Loading...</li>
        )}
      </ul>
    </div>
  );
}

BookingsList.propTypes = {
  bookings: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    labId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    reservationKey: PropTypes.string,
    start: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    end: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    status: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
  })),
  currentTime: PropTypes.instanceOf(Date),
  isLoading: PropTypes.bool.isRequired,
  type: PropTypes.oneOf(['upcoming', 'past']).isRequired,
  onCancel: PropTypes.func,
  onRefund: PropTypes.func,
  onConfirmRefund: PropTypes.func,
  onClearError: PropTypes.func,
  isModalOpen: PropTypes.oneOfType([PropTypes.bool, PropTypes.string]),
  closeModal: PropTypes.func.isRequired,
  failedCancellations: PropTypes.instanceOf(Set),
  selectedBooking: PropTypes.object,
  selectedLabId: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
};
