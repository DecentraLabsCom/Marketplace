/**
 * Lab details panel component
 * Displays lab description, image carousel, and booking controls section
 */
import React from 'react'
import PropTypes from 'prop-types'
import Carrousel from '@/components/ui/Carrousel'
import BookingCalendarSection from '@/components/reservation/BookingCalendarSection'

/**
 * Lab details display with carousel, description, and booking calendar
 * @param {Object} props
 * @param {Object} props.lab - Lab object with details
 * @param {string} props.lab.description - Lab description text
 * @param {Date} props.date - Currently selected date
 * @param {Function} props.onDateChange - Callback when date changes
 * @param {Array} props.bookings - Lab bookings for calendar display
 * @param {Array} props.userBookings - User bookings for calendar display
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
 * @returns {JSX.Element} Lab details panel with carousel and booking controls
 */
export default function LabDetailsPanel({
  lab,
  date,
  onDateChange,
  bookings,
  userBookings,
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
  if (!lab) return null

  return (
    <div className="flex flex-col xl:flex-row gap-6 p-4 xl:items-stretch">
      {/* Image Carousel */}
      <div className="xl:w-1/2 flex flex-col items-center justify-center">
          <div className="w-full flex-1 flex items-center justify-center min-h-100">
          <Carrousel lab={lab} />
        </div>
      </div>

      {/* Lab Description + Booking Controls */}
      <div className="xl:w-1/2 flex flex-col justify-between">
        <p className="text-white text-base text-justify mb-2">
          {lab.description}
        </p>

        <BookingCalendarSection
          lab={lab}
          date={date}
          onDateChange={onDateChange}
          bookings={bookings}
          userBookings={userBookings}
          duration={duration}
          onDurationChange={onDurationChange}
          selectedTime={selectedTime}
          onTimeChange={onTimeChange}
          availableTimes={availableTimes}
          minDate={minDate}
          maxDate={maxDate}
          forceRefresh={forceRefresh}
          isSSO={isSSO}
          formatPrice={formatPrice}
        />
      </div>
    </div>
  )
}

LabDetailsPanel.propTypes = {
  lab: PropTypes.object.isRequired,
  date: PropTypes.instanceOf(Date).isRequired,
  onDateChange: PropTypes.func.isRequired,
  bookings: PropTypes.array, // Can be null initially before data loads
  userBookings: PropTypes.array,
  duration: PropTypes.number.isRequired,
  onDurationChange: PropTypes.func.isRequired,
  selectedTime: PropTypes.string, // Can be null initially before user selects
  onTimeChange: PropTypes.func.isRequired,
  availableTimes: PropTypes.array.isRequired,
  minDate: PropTypes.oneOfType([PropTypes.instanceOf(Date), PropTypes.string]).isRequired,
  maxDate: PropTypes.oneOfType([PropTypes.instanceOf(Date), PropTypes.string]),
  forceRefresh: PropTypes.oneOfType([PropTypes.number, PropTypes.bool]).isRequired,
  isSSO: PropTypes.bool.isRequired,
  formatPrice: PropTypes.func.isRequired
}
