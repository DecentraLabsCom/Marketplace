import React, { useMemo } from 'react'
import PropTypes from 'prop-types'
import DatePicker from 'react-datepicker'
import { Calendar as CalendarIcon, X as ClearIcon } from 'lucide-react'
import { format, parse, parseISO, isValid } from 'date-fns'
import { cn } from '@/utils/cn'

const DISPLAY_FORMAT_DATE = 'MMM d, yyyy'
const DISPLAY_FORMAT_DATETIME = 'MMM d, yyyy h:mm aa'
const OUTPUT_FORMAT_DATE = 'MM/dd/yyyy'

const parseDateValue = (value, { withTime }) => {
  if (!value) return null

  if (value instanceof Date) {
    return isValid(value) ? value : null
  }

  if (withTime) {
    const parsed = new Date(value)
    return isNaN(parsed.getTime()) ? null : parsed
  }

  const normalizedValue = value.replace(/-/g, '/')
  const triedFormats = [
    () => parse(normalizedValue, OUTPUT_FORMAT_DATE, new Date()),
    () => parse(normalizedValue, 'dd/MM/yyyy', new Date()),
    () => parseISO(value),
    () => new Date(value)
  ]

  for (const tryParse of triedFormats) {
    try {
      const parsed = tryParse()
      if (parsed && isValid(parsed)) return parsed
    } catch {
      // try next parser
    }
  }

  return null
}

const formatDateValue = (date, { withTime, outputFormat }) => {
  if (!date || !isValid(date)) return ''
  if (withTime) return date.toISOString()
  const targetFormat = outputFormat || OUTPUT_FORMAT_DATE
  return format(date, targetFormat)
}

export default function CalendarInput({
  label,
  value,
  onChange,
  placeholder = 'Select a date',
  helperText,
  error,
  required = false,
  withTime = false,
  displayFormat,
  outputFormat,
  minDate,
  maxDate,
  disabled = false,
  name,
  calendarClassName,
  popperClassName,
  popperPlacement,
  popperModifiers,
  inline = false,
  containerClassName,
  labelClassName,
  inputClassName
}) {
  const selectedDate = useMemo(
    () => parseDateValue(value, { withTime }),
    [value, withTime]
  )

  const mergedPopperModifiers = useMemo(() => {
    const baseModifiers = [
      {
        name: 'preventOverflow',
        options: {
          padding: 12,
          tether: true,
          boundary: 'viewport'
        }
      }
    ]
    if (Array.isArray(popperModifiers)) {
      return [...baseModifiers, ...popperModifiers]
    }
    return baseModifiers
  }, [popperModifiers])

  const handleChange = (date) => {
    if (!date) {
      onChange('')
      return
    }
    onChange(formatDateValue(date, { withTime, outputFormat }))
  }

  const handleClear = () => {
    if (!disabled) {
      onChange('')
    }
  }

  const dateFormat = displayFormat || (withTime ? DISPLAY_FORMAT_DATETIME : DISPLAY_FORMAT_DATE)

  return (
    <div className={cn('w-full space-y-2', containerClassName)}>
      {label && (
        <label className={cn('block text-sm font-medium text-neutral-900', labelClassName)}>
          {label}
          {required && <span className="text-error ml-1">*</span>}
        </label>
      )}
      <div className="relative">
        <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 size-4 pointer-events-none" />
        {selectedDate && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
            aria-label="Limpiar fecha"
            disabled={disabled}
          >
            <ClearIcon className="size-4" />
          </button>
        )}
        <DatePicker
          selected={selectedDate}
          onChange={handleChange}
          showTimeSelect={withTime}
          timeIntervals={15}
          timeFormat="HH:mm"
          dateFormat={dateFormat}
          placeholderText={placeholder}
          className={cn(
            'block w-full rounded-md border border-neutral-300 py-2 pl-10 pr-10 shadow-sm focus:border-primary-600 focus:ring-primary-600 sm:text-sm transition-colors',
            disabled && 'bg-neutral-100 cursor-not-allowed text-neutral-500',
            error && 'border-error focus:border-error focus:ring-error',
            inputClassName
          )}
          minDate={minDate}
          maxDate={maxDate}
          disabled={disabled}
          name={name}
          calendarClassName={calendarClassName}
          inline={inline}
          popperClassName={popperClassName}
          popperPlacement={popperPlacement}
          popperModifiers={mergedPopperModifiers}
        />
      </div>
      {error ? (
        <p className="text-sm text-error">{error}</p>
      ) : (
        helperText && <p className="text-sm text-neutral-500">{helperText}</p>
      )}
    </div>
  )
}

CalendarInput.propTypes = {
  label: PropTypes.string,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
  onChange: PropTypes.func.isRequired,
  placeholder: PropTypes.string,
  helperText: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
  error: PropTypes.string,
  required: PropTypes.bool,
  withTime: PropTypes.bool,
  displayFormat: PropTypes.string,
  outputFormat: PropTypes.string,
  minDate: PropTypes.oneOfType([PropTypes.instanceOf(Date), PropTypes.string]),
  maxDate: PropTypes.oneOfType([PropTypes.instanceOf(Date), PropTypes.string]),
  disabled: PropTypes.bool,
  name: PropTypes.string,
  calendarClassName: PropTypes.string,
  popperClassName: PropTypes.string,
  popperPlacement: PropTypes.string,
  popperModifiers: PropTypes.array,
  inline: PropTypes.bool,
  containerClassName: PropTypes.string,
  labelClassName: PropTypes.string,
  inputClassName: PropTypes.string
}
