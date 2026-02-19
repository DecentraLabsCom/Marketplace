/**
 * Bookings list component for user dashboard
 * Displays upcoming and past bookings in separate sections
 */
import React, { useEffect, useRef, useState } from 'react';
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
  cancellationStates = new Map(),
  selectedBooking = null,
  selectedLabId = null,
  isSSOUser = false,
  userInstitutionWallet = null,
  excludeReservationKey = null
}) {
  const isUpcoming = type === 'upcoming';
  const title = isUpcoming ? 'Upcoming bookings' : 'Past bookings';
  const emptyMessage = isUpcoming ? 'No upcoming bookings found.' : 'No past bookings found.';
  const listRef = useRef(null);
  const [maxScrollHeight, setMaxScrollHeight] = useState(null);

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
        const startDateTime = new Date(parseInt(booking.start) * 1000);
        const isUpcomingBooking = startDateTime.getTime() > currentTime.getTime();
        if (!isUpcomingBooking) return false;
        if (excludeReservationKey && booking.reservationKey === excludeReservationKey) return false;
        return true;
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
    // ✅ labDetails now comes pre-formatted from the composed hook
    const lab = booking.labDetails || { 
      id: booking.labId,
      name: `Lab ${booking.labId}`,
      provider: 'Unknown Provider',
      images: [],
      docs: []
    };
    
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
  const shouldScroll = enhancedBookings.length > 5;
  const displayedBookings = enhancedBookings.slice(0, 10);

  useEffect(() => {
    if (!shouldScroll) {
      setMaxScrollHeight(null);
      return;
    }
    if (typeof window === 'undefined') return;

    const measure = () => {
      if (!listRef.current) return;
      const items = Array.from(listRef.current.querySelectorAll('li')).slice(0, 5);
      if (!items.length) return;

      let height = 0;
      items.forEach((item) => {
        const styles = window.getComputedStyle(item);
        const marginTop = parseFloat(styles.marginTop) || 0;
        const marginBottom = parseFloat(styles.marginBottom) || 0;
        height += item.getBoundingClientRect().height + marginTop + marginBottom;
      });

      setMaxScrollHeight(Math.ceil(height));
    };

    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [shouldScroll, displayedBookings.length]);

  return (
    <div className="xl:w-1/2 flex flex-col h-full min-h-87.5">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-semibold text-center flex-1 text-slate-100">
          {title}
        </h2>
      </div>
      
      <ul
        ref={listRef}
        className={`w-full flex-1 ${shouldScroll ? 'overflow-y-auto bookings-scroll' : ''}`}
        style={shouldScroll && maxScrollHeight ? { maxHeight: `${maxScrollHeight}px` } : undefined}
      >
          {isLoading ? (
            <DashboardSectionSkeleton title={false} />
          ) : (
          currentTime && displayedBookings.length > 0 ? (
            displayedBookings.map((booking) => {
              const { startTime, endTime } = formatBookingTimes(booking);
              const bookingKey = `${String(booking.lab.id)}-${booking.reservationKey || booking.id}-${booking.start}`;
              
              const itemProps = {
                lab: booking.lab,
                booking: booking,
                startTime,
                endTime,
                isModalOpen: false,
                closeModal,
                isSSOUser,
                userInstitutionWallet,
              };

              // Add type-specific props
              if (isUpcoming) {
                itemProps.onCancel = onCancel;
                itemProps.onClearError = onClearError;
                const cancelState = cancellationStates instanceof Map
                  ? cancellationStates.get(booking.reservationKey)
                  : null;
                itemProps.cancelState = cancelState || null;
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
  cancellationStates: PropTypes.instanceOf(Map),
  selectedBooking: PropTypes.object,
  selectedLabId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  isSSOUser: PropTypes.bool,
  userInstitutionWallet: PropTypes.string,
  excludeReservationKey: PropTypes.string
};
