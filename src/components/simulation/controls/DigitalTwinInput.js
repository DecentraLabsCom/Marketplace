'use client'

import { useEffect, useId, useRef } from 'react'
import PropTypes from 'prop-types'
import {
  formatVariableDisplayValue,
  fromVariableDisplayValue,
  getLeastSignificantDigitStep,
  getVariableDescription,
  getVariableDisplayBounds,
  getVariableDisplayName,
  getVariableDisplayUnit,
  getVariableEnumerationItems,
  getVariableValueCount,
  toVariableDisplayValue,
} from '../utils/simulationParameters'
import VariableDescriptionTooltip from './VariableDescriptionTooltip'

const NUMERIC_TYPES = new Set([
  'Real', 'Float32', 'Float64', 'Integer', 'Enumeration', 'Int8', 'UInt8', 'Int16', 'UInt16', 'Int32', 'UInt32', 'Int64', 'UInt64',
])
const INTEGER_TYPES = new Set([
  'Integer', 'Enumeration', 'Int8', 'UInt8', 'Int16', 'UInt16', 'Int32', 'UInt32', 'Int64', 'UInt64',
])

function isChecked(value) {
  return value === true || String(value).trim().toLowerCase() === 'true'
}

function displayNumericValue(value, variable) {
  const numericValue = Number(toVariableDisplayValue(variable, value))
  if (!Number.isFinite(numericValue)) return String(value ?? '—')
  return numericValue
}

function getWheelAdjustedValue(currentValue, direction, step, min, max, integer) {
  const current = Number(currentValue)
  if (!Number.isFinite(current) || !Number.isFinite(step) || step <= 0) return null

  const lowerBound = min == null || min === '' || !Number.isFinite(Number(min)) ? -Infinity : Number(min)
  const upperBound = max == null || max === '' || !Number.isFinite(Number(max)) ? Infinity : Number(max)
  const steppedValue = current + (direction * step)
  const roundedValue = integer ? Math.round(steppedValue) : Number(steppedValue.toPrecision(12))
  const nextValue = Math.min(upperBound, Math.max(lowerBound, roundedValue))
  return nextValue === current ? null : nextValue
}

function getVariableWheelStep(variable, value) {
  const currentStep = getLeastSignificantDigitStep(toVariableDisplayValue(variable, value))
  const declaredStartStep = getLeastSignificantDigitStep(
    toVariableDisplayValue(variable, variable.start),
  )
  return Math.min(currentStep, declaredStartStep)
}

function VariableNameAndUnit({ variable, displayName, displayUnit, className = '' }) {
  const hasDescription = Boolean(getVariableDescription(variable))
  return (
    <span className={`flex min-w-0 items-baseline gap-1.5 ${className}`}>
      <VariableDescriptionTooltip name={variable.name} description={variable.description}>
        <span className={`block min-w-0 truncate font-medium text-white ${hasDescription ? 'cursor-help' : 'cursor-default'}`}>
          {displayName}
        </span>
      </VariableDescriptionTooltip>
      {displayUnit ? (
        <span className="shrink-0 whitespace-nowrap text-[#a9bec2]">({displayUnit})</span>
      ) : null}
    </span>
  )
}

export default function DigitalTwinInput({ variable, modelVariables, value, onChange, disabled }) {
  const variableDescription = getVariableDescription(variable)
  const displayName = getVariableDisplayName(variable)
  const declaredUnit = getVariableDisplayUnit(variable).trim()
  const displayUnit = declaredUnit && declaredUnit !== '1' ? declaredUnit : '-'
  const accessibleDescription = variableDescription || displayName
  const valueCount = getVariableValueCount(variable, modelVariables)
  const isScalarNumber = NUMERIC_TYPES.has(variable.type) && valueCount === 1
  const isBoolean = String(variable.type || '').toLowerCase() === 'boolean' && valueCount === 1
  const enumItems = valueCount === 1 ? getVariableEnumerationItems(variable) : []
  const inputId = `digital-twin-input-${useId()}`
  const numberInputRef = useRef(null)
  const rangeInputRef = useRef(null)

  useEffect(() => {
    if (disabled || !isScalarNumber) return undefined

    const displayValue = Number(toVariableDisplayValue(variable, value))
    const integer = INTEGER_TYPES.has(variable.type)
    const numberStep = integer ? 1 : getVariableWheelStep(variable, value)
    const bounds = getVariableDisplayBounds(variable)
    const min = bounds.min == null ? -Infinity : Number(bounds.min)
    const max = bounds.max == null ? Infinity : Number(bounds.max)

    const attachWheelHandler = (element, step, preventUnfocusedChange) => {
      if (!element) return () => {}

      const handleNativeWheel = (event) => {
        if (event.deltaY === 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
        const focused = element === document.activeElement
        if (!focused) {
          // Prevent native number-input increments on hover; leave page scrolling
          // available over range sliders.
          if (preventUnfocusedChange) event.preventDefault()
          return
        }

        event.preventDefault()
        const nextValue = getWheelAdjustedValue(
          displayValue,
          event.deltaY < 0 ? 1 : -1,
          step,
          min,
          max,
          integer,
        )
        if (nextValue !== null) {
          onChange(variable.name, fromVariableDisplayValue(variable, nextValue))
        }
      }

      // React's delegated wheel listener can be passive in some browsers, so
      // use a native non-passive listener to reliably suppress the built-in step.
      element.addEventListener('wheel', handleNativeWheel, { passive: false })
      return () => element.removeEventListener('wheel', handleNativeWheel)
    }

    const cleanupNumber = attachWheelHandler(numberInputRef.current, numberStep, true)
    const sliderStep = integer
      ? 1
      : Math.max(Math.min((max - min) / 100, 0.01), 0.000001)
    const cleanupRange = attachWheelHandler(rangeInputRef.current, sliderStep, false)
    return () => {
      cleanupNumber()
      cleanupRange()
    }
  }, [disabled, isScalarNumber, onChange, value, variable])
  if (isBoolean) {
    return (
      <div className="flex min-h-14 min-w-0 items-center gap-3 rounded-xl border border-[#26383f] bg-[#142128] px-3 py-2 text-sm">
        <label htmlFor={inputId} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
          <input
            id={inputId}
            type="checkbox"
            checked={isChecked(value)}
            onChange={(event) => onChange(variable.name, event.target.checked)}
            disabled={disabled}
            className="h-4 w-4 accent-[#54d5c9]"
            aria-label={accessibleDescription}
          />
          <VariableNameAndUnit
            variable={variable}
            displayName={displayName}
            displayUnit={displayUnit}
            className="flex-1"
          />
        </label>
      </div>
    )
  }

  if (String(variable.type || '').toLowerCase() === 'enumeration' && enumItems.length > 0) {
    return (
      <div className="min-w-0 rounded-xl border border-[#26383f] bg-[#142128] px-3 py-2 text-xs text-[#a9bec2]">
        <div className="mb-2 flex min-w-0 items-center">
          <VariableNameAndUnit
            variable={variable}
            displayName={displayName}
            displayUnit={displayUnit}
            className="flex-1"
          />
        </div>
        <select
          id={inputId}
          aria-label={accessibleDescription}
          value={String(value ?? '')}
          onChange={(event) => onChange(variable.name, Number(event.target.value))}
          disabled={disabled}
          className="w-full rounded-lg border border-[#26383f] bg-[#0c171c] px-2 py-1.5 text-sm text-white focus:border-[#54d5c9] focus:outline-none disabled:opacity-40"
        >
          {enumItems.map((item) => (
            <option key={item.value} value={item.value} title={item.description || undefined}>
              {item.description || item.name}
            </option>
          ))}
        </select>
      </div>
    )
  }

  const bounds = getVariableDisplayBounds(variable)
  const min = Number(bounds.min)
  const max = Number(bounds.max)
  const displayValue = Number(toVariableDisplayValue(variable, value))
  const hasRange = NUMERIC_TYPES.has(variable.type)
    && valueCount === 1
    && Number.isFinite(min)
    && Number.isFinite(max)
    && max > min

  if (hasRange) {
    const integer = INTEGER_TYPES.has(variable.type)
    const step = integer ? 1 : Math.max(Math.min((max - min) / 100, 0.01), 0.000001)
    const wheelStep = integer ? 1 : getVariableWheelStep(variable, value)
    const hasInputValue = value !== undefined && value !== null && value !== ''
    const sliderValue = hasInputValue && Number.isFinite(displayValue)
      ? Math.min(max, Math.max(min, displayValue))
      : min
    const handleRangeValueChange = (event) => {
      const rawValue = event.target.value
      if (rawValue === '') {
        onChange(variable.name, '')
        return
      }
      const numericValue = Number(rawValue)
      if (!Number.isFinite(numericValue)) return
      const boundedValue = Math.min(max, Math.max(min, numericValue))
      onChange(variable.name, fromVariableDisplayValue(variable, boundedValue))
    }
    return (
      <div className="min-w-0 rounded-xl border border-[#26383f] bg-[#142128] px-3 py-2 text-xs text-[#a9bec2]">
        <div className="flex min-w-0 items-center">
          <label htmlFor={inputId} className="flex min-w-0 flex-1">
            <VariableNameAndUnit
              variable={variable}
              displayName={displayName}
              displayUnit={displayUnit}
              className="flex-1"
            />
          </label>
        </div>
        <div className="mt-2 flex min-w-0 items-center gap-3">
          <input
            id={inputId}
            aria-label={accessibleDescription}
            type="range"
            min={min}
            max={max}
            step={step}
            value={sliderValue}
            onChange={(event) => onChange(variable.name, fromVariableDisplayValue(variable, Number(event.target.value)))}
            ref={rangeInputRef}
            disabled={disabled}
            className="min-w-0 flex-1 accent-[#54d5c9] disabled:opacity-40"
          />
          <input
            ref={numberInputRef}
            type="number"
            aria-label={`${accessibleDescription} editable value`}
            min={min}
            max={max}
            step={wheelStep}
            value={hasInputValue && Number.isFinite(displayValue) ? displayNumericValue(value, variable) : ''}
            onChange={handleRangeValueChange}
            disabled={disabled}
            className="min-w-0 w-[30%] shrink-0 rounded-lg border border-[#26383f] bg-[#0c171c] px-2 py-1.5 text-right font-mono tabular-nums text-sm text-white [appearance:textfield] focus:border-[#54d5c9] focus:outline-none disabled:opacity-40 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
        </div>
      </div>
    )
  }

  const fieldWheelStep = INTEGER_TYPES.has(variable.type)
    ? 1
    : getVariableWheelStep(variable, value)
  return (
    <div className="min-w-0 rounded-xl border border-[#26383f] bg-[#142128] px-3 py-2 text-xs text-[#a9bec2]">
      <div className="flex min-w-0 items-center">
        <label htmlFor={inputId} className="flex min-w-0 flex-1">
          <VariableNameAndUnit
            variable={variable}
            displayName={displayName}
            displayUnit={displayUnit}
            className="flex-1"
          />
        </label>
      </div>
      <input
        id={inputId}
        ref={numberInputRef}
        aria-label={accessibleDescription}
        type={isScalarNumber ? 'number' : 'text'}
        step={isScalarNumber ? fieldWheelStep : undefined}
        min={isScalarNumber ? bounds.min : undefined}
        max={isScalarNumber ? bounds.max : undefined}
        value={formatVariableDisplayValue(variable, value)}
        onChange={(event) => onChange(variable.name, fromVariableDisplayValue(variable, event.target.value))}
        disabled={disabled}
        className="mt-2 w-full rounded-lg border border-[#26383f] bg-[#0c171c] px-2 py-1.5 text-sm text-white focus:border-[#54d5c9] focus:outline-none disabled:opacity-40"
      />
    </div>
  )
}

DigitalTwinInput.propTypes = {
  variable: PropTypes.object.isRequired,
  modelVariables: PropTypes.arrayOf(PropTypes.object).isRequired,
  value: PropTypes.any,
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
}
