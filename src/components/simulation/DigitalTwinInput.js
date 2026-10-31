'use client'

import { useId } from 'react'
import PropTypes from 'prop-types'
import {
  formatVariableDisplayValue,
  fromVariableDisplayValue,
  getVariableDescription,
  getVariableDisplayBounds,
  getVariableDisplayName,
  getVariableDisplayUnit,
  getVariableEnumerationItems,
  getVariableValueCount,
  toVariableDisplayValue,
} from './simulationParameters'
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
  return numericValue.toFixed(INTEGER_TYPES.has(variable.type) ? 0 : 2)
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
  const isBoolean = String(variable.type || '').toLowerCase() === 'boolean' && valueCount === 1
  const enumItems = valueCount === 1 ? getVariableEnumerationItems(variable) : []
  const inputId = `digital-twin-input-${useId()}`
  const handleWheel = (event, currentValue, step, min, max) => {
    if (disabled || event.deltaY === 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return

    const direction = event.deltaY < 0 ? 1 : -1
    const nextValue = getWheelAdjustedValue(
      currentValue,
      direction,
      step,
      min,
      max,
      INTEGER_TYPES.has(variable.type),
    )
    if (nextValue === null) return

    event.preventDefault()
    onChange(variable.name, fromVariableDisplayValue(variable, nextValue))
  }

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
    && value !== undefined
    && value !== null
    && value !== ''
    && Number.isFinite(displayValue)

  if (hasRange) {
    const integer = INTEGER_TYPES.has(variable.type)
    const step = integer ? 1 : Math.max(Math.min((max - min) / 100, 0.01), 0.000001)
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
            value={displayValue}
            onChange={(event) => onChange(variable.name, fromVariableDisplayValue(variable, Number(event.target.value)))}
            onWheel={(event) => handleWheel(event, displayValue, step, min, max)}
            disabled={disabled}
            className="min-w-0 flex-1 accent-[#54d5c9] disabled:opacity-40"
          />
          <output htmlFor={inputId} aria-hidden="true" className="shrink-0 whitespace-nowrap font-mono tabular-nums text-white">
            {displayNumericValue(value, variable)}
          </output>
        </div>
      </div>
    )
  }

  const isScalarNumber = NUMERIC_TYPES.has(variable.type) && valueCount === 1
  const fieldWheelStep = INTEGER_TYPES.has(variable.type)
    ? 1
    : Number.isFinite(min) && Number.isFinite(max) && max > min
      ? Math.max(Math.min((max - min) / 100, 0.01), 0.000001)
      : Math.max(Math.min(Math.abs(displayValue || 1) * 0.01, 1), 0.01)
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
        aria-label={accessibleDescription}
        type={isScalarNumber ? 'number' : 'text'}
        step={isScalarNumber ? (INTEGER_TYPES.has(variable.type) ? 1 : 'any') : undefined}
        min={isScalarNumber ? bounds.min : undefined}
        max={isScalarNumber ? bounds.max : undefined}
        value={formatVariableDisplayValue(variable, value)}
        onChange={(event) => onChange(variable.name, fromVariableDisplayValue(variable, event.target.value))}
        onWheel={isScalarNumber
          ? (event) => handleWheel(event, displayValue, fieldWheelStep, bounds.min, bounds.max)
          : undefined}
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
