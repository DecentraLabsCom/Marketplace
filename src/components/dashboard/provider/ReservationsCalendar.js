/**
 * Reservations calendar component for provider dashboard
 * Displays upcoming lab reservations in a calendar format
 */
import React from 'react';
import PropTypes from 'prop-types';
import CalendarWithBookings from '@/components/booking/CalendarWithBookings';

/**
 * Renders a calendar showing upcoming lab reservations for providers
 * @param {Object} props - Component props
 * @param {Date} props.selectedDate - Currently selected date
 * @param {Function} props.onDateChange - Callback when date selection changes
 * @param {Array} props.bookingInfo - Array of booking information for calendar display
 * @param {Date} props.minDate - Minimum selectable date
 * @param {Function} props.filterDate - Function to filter selectable dates
 * @returns {JSX.Element} Reservations calendar component
 */
export default function ReservationsCalendar({ 
  selectedDate, 
  onDateChange, 
  bookingInfo = [], 
  minDate,
  filterDate = () => false
}) {
  return (
    <div className="w-full min-[1080px]:w-1/3 mt-8 min-[1080px]:mt-0">
      <h2 className="text-xl font-semibold mb-4 text-center">
        Upcoming Lab Reservations
      </h2>
      
      <div className="flex justify-center">
        <CalendarWithBookings
          selectedDate={selectedDate}
          onDateChange={onDateChange}
          bookingInfo={bookingInfo}
          minDate={minDate}
          filterDate={filterDate}
          displayMode="provider-dashboard"
        />
      </div>
    </div>
  );
}

ReservationsCalendar.propTypes = {
  selectedDate: PropTypes.instanceOf(Date).isRequired,
  onDateChange: PropTypes.func.isRequired,
  bookingInfo: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    labId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    labName: PropTypes.string,
    start: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    end: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    status: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
  })),
  minDate: PropTypes.instanceOf(Date),
  filterDate: PropTypes.func
};
