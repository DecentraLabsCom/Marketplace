"use client";
import React from 'react';
import DatePicker from 'react-datepicker';
import { renderDayContents } from '@/utils/booking/labBookingCalendar';
import devLog from '@/utils/dev/logger';

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
    devLog.log('🔍 Processing booking:', { 
      id: booking.id, 
      status: booking.status, 
      start: booking.start, 
      date: booking.date,
      labId: booking.labId 
    });
    
    // Always exclude cancelled bookings
    if (booking.status === "4" || booking.status === 4) {
      devLog.log('❌ Excluding cancelled booking:', booking.id);
      return false;
    }
    
    // Check if we have the necessary fields for date calculation
    if (!booking.date) {
      devLog.warn('❌ Booking missing date field and start timestamp:', booking);
      return false; // Don't show bookings without date
    }
    
    const today = new Date();
    
    const isPastBooking = (booking) => {
      try {
        if (!booking.start || !booking.end) {
          // If no timestamp info, compare by date only
          const bookingDate = new Date(booking.date);
          if (isNaN(bookingDate.getTime())) return false;
          const bookingDateStart = new Date(bookingDate.getFullYear(), bookingDate.getMonth(), bookingDate.getDate());
          const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
          return bookingDateStart < todayStart;
        } else {
          // Use Unix timestamps to determine if booking has ended
          const endTimestamp = parseInt(booking.end) * 1000; // Convert to milliseconds
          const endDateTime = new Date(endTimestamp);
          return endDateTime < today;
        }
      } catch (error) {
        devLog.warn('Error calculating booking time:', booking, error);
        return false; // Assume not past if we can't calculate
      }
    };
    
    let bookingDate = new Date(booking.date);
    if (isNaN(bookingDate.getTime())) {
      devLog.warn('❌ Invalid booking date after processing:', booking);
      return false;
    }
    
    const isPast = isPastBooking(booking);
    const isPending = booking.status === "0" || booking.status === 0;
    const isConfirmed = booking.status === "1" || booking.status === 1;
    
    let shouldShow = false;
    
    switch (displayMode) {
      case 'lab-reservation':
        // LabReservation: show both pending and confirmed future reservations
        shouldShow = !isPast && (isPending || isConfirmed);
        devLog.log('🏷️ lab-reservation result:', { 
          bookingId: booking.id, 
          shouldShow, 
          isPast, 
          isPending, 
          isConfirmed,
          date: booking.date,
          status: booking.status
        });
        return shouldShow;
        
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

  devLog.log('🔍 CalendarWithBookings: Filtering results:', {
    originalCount: bookingInfo?.length || 0,
    filteredCount: filteredBookings.length,
    displayMode: displayMode,
    filteredBookings: filteredBookings
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
    const dayBookings = filteredBookings.filter(booking => {
      const bookingDate = new Date(booking.date);
      const matches = !isNaN(bookingDate) && bookingDate.toDateString() === day.toDateString();
      
      if (matches) {
        devLog.log('📅 Day matches booking:', {
          day: day.toDateString(),
          bookingDate: bookingDate.toDateString(),
          bookingId: booking.id,
          status: booking.status
        });
      }
      
      return matches;
    });
    
    devLog.log('📅 DayClassName check:', {
      day: day.toDateString(),
      matchingBookings: dayBookings.length,
      bookings: dayBookings.map(b => ({ id: b.id, status: b.status }))
    });
    
    if (dayBookings.length === 0) return undefined;
    
    // Check if all bookings are pending (status 0)
    const allPending = dayBookings.every(booking => 
      booking.status === "0" || booking.status === 0
    );
    
    // Check if any booking is confirmed (status 1)  
    const hasConfirmed = dayBookings.some(booking => 
      booking.status === "1" || booking.status === 1
    );
    
    if (hasConfirmed) {
      return highlightClassName; // Regular highlight for confirmed bookings
    } else if (allPending) {
      return `${highlightClassName} pending-booking`; // Special highlight for pending only
    }
    
    return highlightClassName;
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
