/**
 * Booking calendar section component
 * Handles date/time selection and availability display
 */
import React, { useMemo } from 'react'
import PropTypes from 'prop-types'
import CalendarWithBookings from '@/components/booking/CalendarWithBookings'
import LabTokenInfo from '@/components/reservation/LabTokenInfo'
import { isCancelledBooking } from '@/utils/booking/bookingStatus'

/**
 * Calendar section with time slot selection
 * @param {Object} props
 * @param {Object} props.lab - Selected lab object
 * @param {Date} props.date - Currently selected date
 * @param {Function} props.onDateChange - Callback when date changes
 * @param {Array} props.bookings - Lab bookings for calendar display
 * @param {number} props.duration - Selected duration in minutes
 * @param {Function} props.onDurationChange - Callback when duration changes
 * @param {string} props.selectedTime - Selected start time
 * @param {Function} props.onTimeChange - Callback when time changes
 * @param {Array} props.availableTimes - Available time slots
 * @param {Date} props.minDate - Minimum selectable date
 * @param {Date} props.maxDate - Maximum selectable date
 * @param {number} props.forceRefresh - Key for forcing re-render
 * @param {boolean} props.isSSO - Whether user is SSO
 * @param {Function} props.formatPrice - Price formatting function
 * @returns {JSX.Element} Booking calendar section
 */
export default function BookingCalendarSection({
  lab,
  date,
  onDateChange,
  bookings,
  duration,
  onDurationChange,
  selectedTime,
  onTimeChange,
  availableTimes,
  minDate,
  maxDate,
  forceRefresh,
  isSSO,
  formatPrice
}) {
  // Filter out cancelled bookings for calendar display
  const activeBookings = useMemo(() => 
    (bookings || []).filter(booking => !isCancelledBooking(booking)),
    [bookings]
  )
  
  // Create a stable key that includes booking statuses to force re-render on status changes
  const calendarKey = useMemo(() => {
    const bookingSignature = activeBookings
      .map(b => `${b.reservationKey}-${b.status}`)
      .join('|');
    return `calendar-${lab?.id}-${forceRefresh}-${date.getTime()}-${bookingSignature}`;
  }, [lab?.id, activeBookings, forceRefresh, date]);

  if (!lab) return null

  return (
    <div className="flex flex-col lg:flex-row gap-8 items-start">
      {/* Calendar */}
      <div className="w-full lg:w-72 flex flex-col items-center lg:items-start">
        <label className="block text-lg font-semibold mb-2">Select the date:</label>
        <div className="w-fit">
          <CalendarWithBookings
            key={calendarKey}
            selectedDate={date}
            onDateChange={onDateChange}
            bookingInfo={activeBookings.map(booking => ({
              ...booking,
              labName: lab?.name,
              status: booking.status
            }))}
            minDate={minDate}
            maxDate={maxDate}
            displayMode="lab-reservation"
          />
        </div>
      </div>

      {/* Duration and Time Selection */}
      <div className="w-full lg:w-72 flex flex-col gap-6">
        {/* Duration */}
        <div>
          <label htmlFor="duration-select" className="block text-lg font-semibold mb-2">
            Duration:
          </label>
          <select
            id="duration-select"
            className="w-full p-3 border-2 bg-gray-800 text-white rounded"
            value={duration}
            onChange={(e) => onDurationChange(Number(e.target.value))}
          >
            {(lab?.timeSlots || [15, 30, 60]).map((slot) => (
              <option key={slot} value={slot}>
                {slot} minutes
              </option>
            ))}
          </select>
        </div>

        {/* Starting Time */}
        <div>
          <label htmlFor="time-select" className="block text-lg font-semibold mb-2">
            Starting time:
          </label>
          <select
            id="time-select"
            key={`time-dropdown-${lab?.id}-${bookings?.length || 0}-${forceRefresh}-${date.getTime()}`}
            className={`w-full p-3 border-2 ${
              availableTimes.some(t => !t.disabled)
                ? 'bg-gray-800 text-white'
                : 'bg-gray-600 text-gray-400'
            } rounded`}
            value={selectedTime}
            onChange={(e) => onTimeChange(e.target.value)}
            disabled={!availableTimes.some(t => !t.disabled)}
          >
            {availableTimes.map((timeOption, i) => (
              <option
                key={`${timeOption.value}-${i}`}
                value={timeOption.value}
                disabled={timeOption.disabled}
                style={{ color: timeOption.isReserved ? 'gray' : 'white' }}
              >
                {timeOption.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Payment Info (Wallet users only) */}
      {!isSSO && (
        <div className="w-full lg:w-96 flex flex-col">
          <label className="block text-lg font-semibold mb-2">Payment info:</label>
          <LabTokenInfo
            className="h-fit"
            labPrice={lab.price}
            durationMinutes={duration}
          />
          <p className="text-text-secondary font-semibold text-xl mt-4 text-center">
            {formatPrice(lab.price)} $LAB / hour
          </p>
        </div>
      )}
    </div>
  )
}

BookingCalendarSection.propTypes = {
  lab: PropTypes.object.isRequired,
  date: PropTypes.instanceOf(Date).isRequired,
  onDateChange: PropTypes.func.isRequired,
  bookings: PropTypes.array.isRequired,
  duration: PropTypes.number.isRequired,
  onDurationChange: PropTypes.func.isRequired,
  selectedTime: PropTypes.string.isRequired,
  onTimeChange: PropTypes.func.isRequired,
  availableTimes: PropTypes.array.isRequired,
  minDate: PropTypes.instanceOf(Date).isRequired,
  maxDate: PropTypes.instanceOf(Date),
  forceRefresh: PropTypes.number.isRequired,
  isSSO: PropTypes.bool.isRequired,
  formatPrice: PropTypes.func.isRequired
}
