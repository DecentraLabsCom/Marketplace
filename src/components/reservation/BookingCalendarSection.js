/**
 * Booking calendar section component
 * Handles date/time selection and availability display
 */
import React, { useMemo } from 'react'
import PropTypes from 'prop-types'
import CalendarWithBookings from '@/components/booking/CalendarWithBookings'
import LabCreditInfo from '@/components/reservation/LabCreditInfo'
import { isCancelledBooking } from '@/utils/booking/bookingStatus'
import { isDayFullyUnavailable } from '@/utils/booking/labBookingCalendar'
import { mapBookingsForCalendar } from '@/utils/booking/calendarBooking'

const toDateInputValue = (value) => {
  if (!(value instanceof Date) || isNaN(value.getTime())) return ''
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const fromDateInputValue = (value) => {
  if (!value) return null
  const parsed = new Date(`${value}T00:00:00`)
  return isNaN(parsed.getTime()) ? null : parsed
}

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
  userBookings,
  duration,
  onDurationChange,
  selectedTime,
  onTimeChange,
  availableTimes,
  isCalendarPeriod = false,
  allowedDurations = [],
  allowCustomDateRange = false,
  periodEndDate,
  onPeriodEndDateChange,
  minDate,
  maxDate,
  forceRefresh,
  isSSO,
  formatPrice
}) {
  // Calendar highlight should reflect only the connected user's bookings.
  // Lab-wide bookings are still passed separately to block occupied slots in time dropdown generation.
  const calendarBookings = useMemo(() => {
    const userEntries = Array.isArray(userBookings) ? userBookings : []
    const mergedByKey = new Map()

    const getBookingKey = (booking, index) => {
      if (!booking || typeof booking !== 'object') return `invalid-${index}`
      if (booking.reservationKey) return `rk-${booking.reservationKey}`
      if (booking.id) return `id-${booking.id}`
      return `slot-${booking.labId || 'lab'}-${booking.start || 'start'}-${booking.end || 'end'}-${index}`
    }

    userEntries.forEach((booking, index) => {
      mergedByKey.set(getBookingKey(booking, index), booking)
    })

    return Array.from(mergedByKey.values()).filter((booking) => !isCancelledBooking(booking))
  }, [userBookings])
  
  // Create a stable key that includes booking statuses to force re-render on status changes
  const calendarKey = useMemo(() => {
    const bookingSignature = calendarBookings
      .map(b => `${b.reservationKey}-${b.status}`)
      .join('|');
    return `calendar-${lab?.id}-${forceRefresh}-${date.getTime()}-${bookingSignature}`;
  }, [lab?.id, calendarBookings, forceRefresh, date]);

  const filterUnavailableDays = useMemo(() => {
    if (!lab) return undefined
    return (day) => !isDayFullyUnavailable({ date: day, lab, interval: duration })
  }, [lab, duration])

  const unavailableDayClassName = useMemo(() => {
    if (!lab) return undefined
    return (day) => {
      if (!(day instanceof Date) || isNaN(day.getTime())) return ''
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const dayStart = new Date(day)
      dayStart.setHours(0, 0, 0, 0)
      if (dayStart < today) return ''
      return isDayFullyUnavailable({ date: day, lab, interval: duration }) ? 'unavailable-day' : ''
    }
  }, [lab, duration])

  const periodOptions = useMemo(() => {
    const toOption = (duration) => {
      const value = Number(duration?.value)
      const unit = String(duration?.unit || '').toLowerCase()
      if (!Number.isFinite(value) || value <= 0) return null
      if (unit === 'day' || unit === 'days') return { days: value, label: `${value} day${value === 1 ? '' : 's'}` }
      if (unit === 'week' || unit === 'weeks') return { days: value * 7, label: `${value} week${value === 1 ? '' : 's'}` }
      if (unit === 'month' || unit === 'months') return { days: value * 30, label: `${value} 30-day month${value === 1 ? '' : 's'}` }
      return null
    }
    const options = allowedDurations.map(toOption).filter(Boolean)
    return options.length ? options : [{ days: 1, label: '1 day' }]
  }, [allowedDurations])

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
            bookingInfo={mapBookingsForCalendar(calendarBookings, { labName: lab?.name })}
            minDate={minDate}
            maxDate={maxDate}
            displayMode="lab-reservation"
            filterDate={filterUnavailableDays}
            extraDayClassName={unavailableDayClassName}
          />
        </div>
      </div>

      {/* Duration and Time Selection */}
      <div className="w-full lg:w-72 flex flex-col gap-6">
        {/* Duration */}
        <div>
          <label htmlFor="duration-select" className="block text-lg font-semibold mb-2">
            {isCalendarPeriod ? 'Period:' : 'Duration:'}
          </label>
          <select
            id="duration-select"
            className="w-full p-3 border-2 bg-gray-800 text-white rounded"
            value={duration}
            onChange={(e) => onDurationChange(Number(e.target.value))}
          >
            {isCalendarPeriod
              ? periodOptions.map((option) => (
                <option key={`${option.days}-${option.label}`} value={option.days}>
                  {option.label}
                </option>
              ))
              : (lab?.timeSlots || [15, 30, 60]).map((slot) => (
                <option key={slot} value={slot}>
                  {slot} minutes
                </option>
              ))}
          </select>
        </div>

        {isCalendarPeriod && allowCustomDateRange && (
          <div>
            <label htmlFor="period-end-date" className="block text-lg font-semibold mb-2">
              End date:
            </label>
            <input
              id="period-end-date"
              type="date"
              className="w-full p-3 border-2 bg-gray-800 text-white rounded"
              min={toDateInputValue(date)}
              max={toDateInputValue(maxDate)}
              value={toDateInputValue(periodEndDate)}
              onChange={(event) => onPeriodEndDateChange?.(fromDateInputValue(event.target.value))}
            />
          </div>
        )}

        {/* Starting Time */}
        {!isCalendarPeriod && <div>
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
            value={selectedTime ?? ''}
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
                {timeOption.maxConcurrent
                  ? `${timeOption.label} (${timeOption.occupancy}/${timeOption.maxConcurrent})`
                  : timeOption.label}
              </option>
            ))}
          </select>
        </div>}
      </div>

      {/* Payment info is shown only for the non-SSO fallback path. */}
      {!isSSO && (
        <div className="w-full lg:w-96 flex flex-col">
          <label className="block text-lg font-semibold mb-2">Payment info:</label>
          <LabCreditInfo
            className="h-fit"
            labPrice={lab.price}
            durationMinutes={isCalendarPeriod ? duration * 24 * 60 : duration}
          />
          <p className="text-text-secondary font-semibold text-xl mt-4 text-center">
            {formatPrice(lab.price, lab?.pricing?.displayUnit || 'hour')} credits / {lab?.pricing?.displayUnit || 'hour'}
          </p>
        </div>
      )}
    </div>
  )
}

BookingCalendarSection.propTypes = {
  lab: PropTypes.object,
  date: PropTypes.instanceOf(Date).isRequired,
  onDateChange: PropTypes.func.isRequired,
  bookings: PropTypes.array, // Can be null initially before data loads
  userBookings: PropTypes.array,
  duration: PropTypes.number.isRequired,
  onDurationChange: PropTypes.func.isRequired,
  selectedTime: PropTypes.string, // Can be null initially before user selects
  onTimeChange: PropTypes.func.isRequired,
  availableTimes: PropTypes.array.isRequired,
  isCalendarPeriod: PropTypes.bool,
  allowedDurations: PropTypes.array,
  allowCustomDateRange: PropTypes.bool,
  periodEndDate: PropTypes.instanceOf(Date),
  onPeriodEndDateChange: PropTypes.func,
  minDate: PropTypes.oneOfType([PropTypes.instanceOf(Date), PropTypes.string]).isRequired,
  maxDate: PropTypes.oneOfType([PropTypes.instanceOf(Date), PropTypes.string]),
  forceRefresh: PropTypes.oneOfType([PropTypes.number, PropTypes.bool]).isRequired,
  isSSO: PropTypes.bool.isRequired,
  formatPrice: PropTypes.func.isRequired
}

