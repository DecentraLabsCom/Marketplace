"use client";
import React from 'react';
import DatePicker from 'react-datepicker';
import { renderDayContents } from '@/utils/labBookingCalendar';

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
  
  // Filter bookings based on display mode and business logic
  const filteredBookings = bookingInfo.filter(booking => {
    // Always exclude cancelled bookings
    if (booking.status === "4" || booking.status === 4) return false;
    
    // Check if we have the necessary fields for date calculation
    if (!booking.date) {
      console.warn('Booking missing date field:', booking);
      return false; // Don't show bookings without date
    }
    
    const today = new Date();
    
    const isPastBooking = (booking) => {
      try {
        if (!booking.time || !booking.minutes) {
          // If no time info, compare by date only
          const bookingDate = new Date(booking.date);
          if (isNaN(bookingDate.getTime())) return false;
          const bookingDateStart = new Date(bookingDate.getFullYear(), bookingDate.getMonth(), bookingDate.getDate());
          const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
          return bookingDateStart < todayStart;
        } else {
          // If we have complete time info, calculate precise end time
          const endDateTime = new Date(`${booking.date}T${booking.time}`);
          endDateTime.setMinutes(endDateTime.getMinutes() + parseInt(booking.minutes));
          return endDateTime < today;
        }
      } catch (error) {
        console.warn('Error calculating booking time:', booking, error);
        return false; // Assume not past if we can't calculate
      }
    };
    
    const bookingDate = new Date(booking.date);
    if (isNaN(bookingDate.getTime())) return false;
    
    const isPast = isPastBooking(booking);
    const isPending = booking.status === "0" || booking.status === 0;
    const isConfirmed = booking.status === "1" || booking.status === 1;
    
    switch (displayMode) {
      case 'lab-reservation':
        // LabReservation: only future and confirmed reservations of the selected lab
        return !isPast && isConfirmed;
        
      case 'user-dashboard':
        // UserDashboard: user reservations (past and future with specific conditions)
        if (isPast) {
          // Past: only non-canceled and confirmed
          return isConfirmed;
        } else {
          // Future: only confirmed and pending
          return isConfirmed || isPending;
        }
        
      case 'provider-dashboard':
        // ProviderDashboard: user reservations (past and future with specific conditions)
        if (isPast) {
          // Past: only non-canceled and confirmed
          return isConfirmed;
        } else {
          // Future: only confirmed and pending
          return isConfirmed || isPending;
        }
        
      default:
        // Default behavior: exclude only past pending bookings
        if (isPending && isPast) {
          return false;
        }
        return true;
    }
  });

  // Render days with reservation tooltips
  const dayContents = (day, currentDateRender) =>
    renderDayContents({
      day,
      currentDateRender,
      bookingInfo: filteredBookings
    });

  // Function to determine if a day should be highlighted
  const dayClassName = (day) => {
    const hasBookings = filteredBookings.some(booking => {
      const bookingDate = new Date(booking.date);
      return !isNaN(bookingDate) && bookingDate.toDateString() === day.toDateString();
    });
    
    return hasBookings ? highlightClassName : undefined;
  };

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
  );
}
