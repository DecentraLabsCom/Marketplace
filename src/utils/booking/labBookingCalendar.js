import { format, isToday } from 'date-fns'
import { getBookingStatusText } from './bookingStatus'
import { isSameCalendarDay } from '@/utils/dates/parseDateSafe'
import devLog from '@/utils/dev/logger'

const MINUTES_IN_DAY = 24 * 60
const WEEKDAYS = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY'
]

const parseTimeToMinutes = (timeString) => {
  if (typeof timeString !== 'string') return null
  const match = timeString.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
  if (!match) return null
  const [, hours, minutes] = match
  return Number(hours) * 60 + Number(minutes)
}

const toDateFromUnix = (value) => {
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null

    const isoCandidate = new Date(trimmed)
    if (!isNaN(isoCandidate.getTime()) && !/^\d+$/.test(trimmed)) {
      return isoCandidate
    }
  }

  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  const millis = numeric > 1e12 ? numeric : numeric * 1000
  const parsed = new Date(millis)
  return isNaN(parsed.getTime()) ? null : parsed
}

const getBoundaryDate = (booking, candidates, reducer) => {
  const parsed = candidates
    .map((key) => toDateFromUnix(booking?.[key]))
    .filter(Boolean)

  if (parsed.length === 0) return null

  return parsed.reduce((selected, current) =>
    reducer(current.getTime(), selected.getTime()) === current.getTime() ? current : selected
  )
}

const toDurationMillis = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return null

  // Heuristic:
  // - <= 24h expressed in minutes -> convert minutes to ms
  // - <= 24h expressed in seconds -> convert seconds to ms
  if (numeric <= 24 * 60) return numeric * 60 * 1000
  if (numeric <= 24 * 60 * 60) return numeric * 1000
  return null
}

const resolveBookingRange = (booking, durationMinutes) => {
  const start = getBoundaryDate(
    booking,
    ['start', 'startTime', 'startUnix', 'startsAt', 'from'],
    Math.min
  )
  if (!start) return null

  let end = getBoundaryDate(
    booking,
    ['end', 'endTime', 'endUnix', 'endsAt', 'to'],
    Math.max
  )

  if (!end || end <= start) {
    const durationMillis =
      toDurationMillis(booking?.durationSeconds) ||
      toDurationMillis(booking?.timeslotSeconds) ||
      toDurationMillis(booking?.timeslot) ||
      toDurationMillis(booking?.duration) ||
      (Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes * 60 * 1000 : null)

    if (durationMillis) {
      end = new Date(start.getTime() + durationMillis)
    }
  }

  if (!end || end <= start) return null
  return { start, end }
}

const toUnixSeconds = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  if (numeric > 1e12) return Math.floor(numeric / 1000)
  return Math.floor(numeric)
}

const normalizeUnavailableWindows = (unavailableWindows = []) => {
  if (!Array.isArray(unavailableWindows)) return []
  return unavailableWindows
    .map((window) => {
      const start = Number(window?.startUnix ?? window?.start)
      const end = Number(window?.endUnix ?? window?.end)
      if (!Number.isFinite(start) || !Number.isFinite(end)) return null
      return { startUnix: start, endUnix: end }
    })
    .filter(Boolean)
}

const getZonedTimeInfo = (date, timeZone, fallbackWeekday) => {
  if (!timeZone) {
    return {
      minutesOfDay: date.getHours() * 60 + date.getMinutes(),
      weekday: WEEKDAYS[date.getDay()]
    }
  }

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'long'
    }).formatToParts(date)
    const mapped = parts.reduce((acc, part) => {
      if (part.type !== 'literal') {
        acc[part.type] = part.value
      }
      return acc
    }, {})
    const hour = Number(mapped.hour)
    const minute = Number(mapped.minute)
    const weekday = mapped.weekday ? mapped.weekday.toUpperCase() : fallbackWeekday

    if (Number.isFinite(hour) && Number.isFinite(minute)) {
      return {
        minutesOfDay: hour * 60 + minute,
        weekday
      }
    }
  } catch (error) {
    devLog.warn('generateTimeOptions: failed to apply timezone', { error, timeZone })
  }

  return {
    minutesOfDay: date.getHours() * 60 + date.getMinutes(),
    weekday: fallbackWeekday
  }
}

const getWeekdayForDate = (date, timeZone) => {
  const fallbackWeekday = WEEKDAYS[date.getDay()]
  if (!timeZone) return fallbackWeekday

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'long'
    }).formatToParts(date)
    const weekdayPart = parts.find(part => part.type === 'weekday')?.value
    return weekdayPart ? weekdayPart.toUpperCase() : fallbackWeekday
  } catch (error) {
    devLog.warn('getWeekdayForDate: failed to apply timezone', { error, timeZone })
  }

  return fallbackWeekday
}

export const isDayFullyUnavailable = ({ date, lab }) => {
  if (!(date instanceof Date) || isNaN(date.getTime()) || !lab) return false

  const timezone = typeof lab?.timezone === 'string' ? lab.timezone.trim() : undefined
  const opensUnix = toUnixSeconds(lab?.opens)
  const closesUnix = toUnixSeconds(lab?.closes)
  const availableDays = Array.isArray(lab?.availableDays)
    ? lab.availableDays.map(day => day?.toUpperCase?.()).filter(Boolean)
    : []

  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(date)
  dayEnd.setHours(23, 59, 59, 999)
  const dayStartUnix = Math.floor(dayStart.getTime() / 1000)
  const dayEndUnix = Math.floor(dayEnd.getTime() / 1000)

  // No slot can start before opens or end after closes.
  if (Number.isFinite(opensUnix) && dayEndUnix <= opensUnix) return true
  if (Number.isFinite(closesUnix) && dayStartUnix >= closesUnix) return true

  if (availableDays.length > 0) {
    const weekday = getWeekdayForDate(date, timezone)
    if (!availableDays.includes(weekday)) return true
  }

  const unavailableWindows = normalizeUnavailableWindows(lab?.unavailableWindows)
  if (unavailableWindows.length > 0) {
    const isFullyCovered = unavailableWindows.some(window => {
      if (!Number.isFinite(window.startUnix) || !Number.isFinite(window.endUnix)) return false
      return window.startUnix <= dayStartUnix && window.endUnix >= dayEndUnix
    })

    if (isFullyCovered) return true
  }

  return false
}

/**
 * Generates available time slot options for a specific day
 * Filters out past time slots and slots that conflict with existing bookings
 * @param {Object} params - Parameters for time option generation
 * @param {Date} params.date - Target date to generate time options for
 * @param {number} params.interval - Time interval in minutes for each slot
 * @param {Array} params.bookingInfo - Array of existing booking objects
 * @param {Object} params.lab - Lab metadata for availability rules
 * @param {Date} [params.now=new Date()] - Current client date for validations
 * @returns {Array<Object>} Array of time slot objects with value, label, and disabled status
 */
// Returns the available time slots for a specific day
export function generateTimeOptions({ date, interval, bookingInfo, lab, now = new Date() }) {
  const options = []
  const durationMinutes = Number(interval)

  if (!(date instanceof Date) || isNaN(date.getTime()) || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return options
  }

  const timezone = typeof lab?.timezone === 'string' ? lab.timezone.trim() : undefined
  const opensUnix = toUnixSeconds(lab?.opens)
  const closesUnix = toUnixSeconds(lab?.closes)
  const availableDays = Array.isArray(lab?.availableDays) ? lab.availableDays.map(day => day?.toUpperCase?.()).filter(Boolean) : []
  const parsedHoursStart = parseTimeToMinutes(lab?.availableHours?.start)
  const parsedHoursEnd = parseTimeToMinutes(lab?.availableHours?.end)
  const hasDailyHours = Number.isFinite(parsedHoursStart) && Number.isFinite(parsedHoursEnd) && parsedHoursEnd > parsedHoursStart
  const unavailableWindows = normalizeUnavailableWindows(lab?.unavailableWindows)

  // Only log if there are bookings to avoid spam
  if (bookingInfo && bookingInfo.length > 0) {
    devLog.log('⏰ generateTimeOptions - Processing bookings:', {
      date: date.toDateString(),
      interval,
      bookingCount: bookingInfo.length
    })
  }
  
  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(date)
  dayEnd.setHours(23, 59, 59, 999)
  const dayEndExclusive = new Date(dayEnd.getTime() + 1)

  const dayBookings = (bookingInfo || [])
    .map((booking) => ({
      booking,
      range: resolveBookingRange(booking, durationMinutes),
    }))
    .filter(({ booking, range }) => {
      if (range) {
        return range.start < dayEndExclusive && range.end > dayStart
      }

      const bookingDate = booking?.date || booking?.dateString
      if (bookingDate && isSameCalendarDay(bookingDate, date)) return true

      return false
    })

  let slot = new Date(dayStart)
  while (slot <= dayEnd) {
    const slotStart = new Date(slot)
    const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000)
    const slotStartInfo = getZonedTimeInfo(slotStart, timezone, WEEKDAYS[slotStart.getDay()])

    const isPast = isToday(date) && slotStart <= now
    const outsideDayAvailability = availableDays.length > 0 && !availableDays.includes(slotStartInfo.weekday)
    const outsideHours = hasDailyHours
      ? (
          slotStartInfo.minutesOfDay < parsedHoursStart ||
          slotStartInfo.minutesOfDay >= parsedHoursEnd ||
          (slotStartInfo.minutesOfDay + durationMinutes) > parsedHoursEnd
        )
      : false

    const conflictsWithBooking = dayBookings.some(({ range }) => {
      if (!range) return false
      return slotStart < range.end && slotEnd > range.start
    })

    const slotStartUnix = Math.floor(slotStart.getTime() / 1000)
    const slotEndUnix = Math.floor(slotEnd.getTime() / 1000)
    const outsideGlobalWindow =
      (Number.isFinite(opensUnix) && slotStartUnix < opensUnix) ||
      (Number.isFinite(closesUnix) && slotEndUnix > closesUnix)
    const inMaintenanceWindow = unavailableWindows.some((window) => 
      slotStartUnix < window.endUnix && slotEndUnix > window.startUnix
    )

    const isBlocked = isPast || outsideDayAvailability || outsideHours || outsideGlobalWindow || conflictsWithBooking || inMaintenanceWindow
    const isReserved = conflictsWithBooking || inMaintenanceWindow
    const timeFormatted = format(slotStart, "HH:mm")

    options.push({
      value: timeFormatted,
      label: timeFormatted,
      disabled: isBlocked,
      isReserved
    })

    slot = slotEnd
  }

  return options
}

/**
 * Renders day contents for calendar with booking information tooltips
 * Shows booking details when hovering over days that have reservations
 * @param {Object} params - Parameters for day content rendering
 * @param {Date} params.day - Calendar day being rendered
 * @param {Date} params.currentDateRender - Current date being processed for rendering
 * @param {Array} params.bookingInfo - Array of booking objects with date and time information
 * @returns {JSX.Element} Rendered day content with booking tooltips
 */
// Returns the content of the day for the calendar (tooltip with reserved hours)
export function renderDayContents({ day, currentDateRender, bookingInfo }) {
    const bookingsOnDay = (bookingInfo || [])
        .filter(b => {
            const dateStr = b.dateString || b.date;
            return isSameCalendarDay(dateStr, currentDateRender);
        });

    let title = undefined;

    if (bookingsOnDay.length > 0) {
        title = bookingsOnDay.map((booking) => {
            if (booking?.start && booking?.end) {
                // Convert Unix timestamps to Date objects
                const startDate = new Date(parseInt(booking.start) * 1000);
                const endDate = new Date(parseInt(booking.end) * 1000);
                
                if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return 'Booked';
                
                // Format time strings
                const startTime = `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`;
                const endTime = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`;
                
                // Add status indicator to the booking text
                const statusText = booking.status !== 1 ? ` (${getBookingStatusText(booking)})` : "";
                return `${booking.labName ? booking.labName + ': ' : ''}${startTime} - ${endTime}${statusText}`;
            }
            const statusText = booking.status !== 1 ? ` (${getBookingStatusText(booking)})` : "";
            return booking.labName ? `Booked: ${booking.labName}${statusText}` : `Booked${statusText}`;
        }).join('\n');
    }

    return <div title={title}>{day}</div>;
}
