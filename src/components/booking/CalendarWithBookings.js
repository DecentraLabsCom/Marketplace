"use client";
import React from 'react'
import PropTypes from 'prop-types'
import DatePicker from 'react-datepicker'
import { useBookingFilter } from '@/hooks/booking/useBookingFilter'
import { renderDayContents } from '@/utils/booking/labBookingCalendar'

/**
 * Reusable calendar component that shows bookings with tooltips and highlighting
 * @param {Object} props
 * @param {Date} props.selectedDate - Currently selected date
 * @param {Function} props.onDateChange - Callback when date changes
 * @param {Array} props.bookingInfo - Array of booking objects to display
 * @param {Date} props.minDate - Minimum selectable date (optional)
 * @param {Date} props.maxDate - Maximum selectable date (optional)
 * @param {boolean} props.inline - Whether to show calendar inline (default: true)
 * @param {string} props.calendarClassName - Additional CSS classes for calendar
 * @param {Function} props.filterDate - Function to filter which dates are selectable (optional)
 * @param {string} props.highlightClassName - CSS class for highlighted days (default: "bg-[#9fc6f5] text-white")
 * @param {string} props.displayMode - Display mode: 'lab-reservation', 'user-dashboard', or 'provider-dashboard'
 */
export default function CalendarWithBookings({
  selectedDate,
  onDateChange,
  bookingInfo = [],
  minDate,
  maxDate,
  inline = true,
  calendarClassName = "custom-datepicker",
  filterDate,
  highlightClassName = "bg-[#9fc6f5] text-white",
  displayMode = 'default'
}) {

  // Use custom hook for booking filtering and day highlighting
  const { filteredBookings, dayClassName } = useBookingFilter(
    bookingInfo, 
    displayMode, 
    highlightClassName
  )

  // Render days with reservation tooltips
  const dayContents = (day, currentDateRender) =>
    renderDayContents({
      day,
      currentDateRender,
      bookingInfo: filteredBookings
    })

  return (
    <DatePicker
      calendarClassName={calendarClassName}
      selected={selectedDate}
      onChange={onDateChange}
      minDate={minDate}
      maxDate={maxDate}
      inline={inline}
      filterDate={filterDate}
      dayClassName={dayClassName}
      renderDayContents={dayContents}
    />
  )
}

CalendarWithBookings.propTypes = {
  selectedDate: PropTypes.instanceOf(Date),
  onDateChange: PropTypes.func.isRequired,
  bookingInfo: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    status: PropTypes.string,
    start: PropTypes.oneOfType([PropTypes.string, PropTypes.number, PropTypes.instanceOf(Date)]),
    date: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
    end: PropTypes.oneOfType([PropTypes.string, PropTypes.number, PropTypes.instanceOf(Date)])
  })),
  minDate: PropTypes.instanceOf(Date),
  maxDate: PropTypes.instanceOf(Date),
  inline: PropTypes.bool,
  calendarClassName: PropTypes.string,
  filterDate: PropTypes.func,
  highlightClassName: PropTypes.string,
  displayMode: PropTypes.oneOf(['default', 'lab-reservation', 'user-dashboard', 'provider-dashboard'])
}

CalendarWithBookings.defaultProps = {
  selectedDate: null,
  bookingInfo: [],
  minDate: null,
  maxDate: null,
  inline: true,
  calendarClassName: "custom-datepicker",
  filterDate: null,
  highlightClassName: "bg-[#9fc6f5] text-white",
  displayMode: 'default'
}
