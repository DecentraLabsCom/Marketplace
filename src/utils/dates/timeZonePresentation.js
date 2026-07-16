const SELECTED_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

const toValidDate = (value) => {
  const date = value instanceof Date ? new Date(value) : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function isSupportedTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || !timeZone.trim()) return false

  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: timeZone.trim() }).format()
    return true
  } catch {
    return false
  }
}

export function getLocalTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'your local time zone'
  } catch {
    return 'your local time zone'
  }
}

export function formatDateTimeInTimeZone(value, timeZone) {
  const date = toValidDate(value)
  if (!date || !isSupportedTimeZone(timeZone)) return null

  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timeZone.trim(),
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
}

export function getSelectedSlotTimeZonePresentation({ date, selectedTime, labTimeZone }) {
  if (!isSupportedTimeZone(labTimeZone) || typeof selectedTime !== 'string') return null

  const match = selectedTime.match(SELECTED_TIME_PATTERN)
  const selectedDate = toValidDate(date)
  if (!match || !selectedDate) return null

  const selectedInstant = new Date(selectedDate)
  selectedInstant.setHours(Number(match[1]), Number(match[2]), 0, 0)

  const localTimeZone = getLocalTimeZone()
  return {
    labTimeZone: labTimeZone.trim(),
    localTimeZone,
    localTime: formatDateTimeInTimeZone(selectedInstant, localTimeZone),
    labTime: formatDateTimeInTimeZone(selectedInstant, labTimeZone),
  }
}
