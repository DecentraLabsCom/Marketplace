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

export default function DigitalTwinInput({ variable, modelVariables, value, onChange, disabled }) {
  const variableDescription = getVariableDescription(variable)
  const displayName = getVariableDisplayName(variable)
  const displayUnit = getVariableDisplayUnit(variable)
  const accessibleDescription = variableDescription || displayName
  const valueCount = getVariableValueCount(variable, modelVariables)
  const isBoolean = String(variable.type || '').toLowerCase() === 'boolean' && valueCount === 1
  const enumItems = valueCount === 1 ? getVariableEnumerationItems(variable) : []
  const inputId = `digital-twin-input-${useId()}`

  if (isBoolean) {
    return (
      <div className="flex min-h-14 items-center gap-3 rounded-xl border border-[#26383f] bg-[#142128] px-3 py-2 text-sm">
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
          <span className="block min-w-0 truncate font-medium text-white" title={variable.name}>{displayName}</span>
        </label>
        <VariableDescriptionTooltip name={variable.name} description={variable.description} portal />
      </div>
    )
  }

  if (String(variable.type || '').toLowerCase() === 'enumeration' && enumItems.length > 0) {
    return (
      <div className="rounded-xl border border-[#26383f] bg-[#142128] px-3 py-2 text-xs text-[#a9bec2]">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="font-medium text-white" title={variable.name}>{displayName}</span>
          <VariableDescriptionTooltip name={variable.name} description={variable.description} portal />
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
      <div className="rounded-xl border border-[#26383f] bg-[#142128] px-3 py-2 text-xs text-[#a9bec2]">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={inputId} className="flex min-w-0 flex-1 items-center justify-between gap-2">
            <span className="font-medium text-white" title={variable.name}>{displayName}</span>
            <span>{displayNumericValue(value, variable)} {displayUnit}</span>
          </label>
          <VariableDescriptionTooltip name={variable.name} description={variable.description} portal />
        </div>
        <input
          id={inputId}
          aria-label={accessibleDescription}
          type="range"
          min={min}
          max={max}
          step={step}
          value={displayValue}
          onChange={(event) => onChange(variable.name, fromVariableDisplayValue(variable, Number(event.target.value)))}
          disabled={disabled}
          className="mt-2 w-full accent-[#54d5c9] disabled:opacity-40"
        />
      </div>
    )
  }

  const isScalarNumber = NUMERIC_TYPES.has(variable.type) && valueCount === 1
  return (
    <div className="rounded-xl border border-[#26383f] bg-[#142128] px-3 py-2 text-xs text-[#a9bec2]">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <span className="font-medium text-white" title={variable.name}>{displayName}</span>
          {displayUnit ? <span>{displayUnit}</span> : null}
        </label>
        <VariableDescriptionTooltip name={variable.name} description={variable.description} portal />
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
