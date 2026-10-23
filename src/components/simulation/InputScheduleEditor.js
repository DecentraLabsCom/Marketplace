'use client'

import { useId } from 'react'
import PropTypes from 'prop-types'
import {
  formatVariableDisplayValue,
  fromVariableDisplayValue,
  getVariableDisplayBounds,
  getVariableDisplayName,
  getVariableDisplayUnit,
  getVariableEnumerationItems,
  getVariableValueCount,
  toVariableDisplayValue,
} from './simulationParameters'
import VariableDescriptionTooltip from './VariableDescriptionTooltip'

const INTEGER_TYPES = new Set([
  'Integer', 'Enumeration', 'Int8', 'UInt8', 'Int16', 'UInt16', 'Int32', 'UInt32', 'Int64', 'UInt64',
])
const NUMERIC_TYPES = new Set(['Real', 'Float32', 'Float64', ...INTEGER_TYPES])
const MAX_INPUT_EVENTS = 128

function booleanValue(value) {
  return value === true || String(value).trim().toLowerCase() === 'true'
}

function findDefaultValue(variable, initialValues, events, time, excludedId, modelVariables) {
  const previous = events
    .filter((event) => (
      event.id !== excludedId
      && event.variable === variable.name
      && Number.isFinite(Number(event.time))
      && Number(event.time) <= time
    ))
    .sort((left, right) => Number(right.time) - Number(left.time))[0]

  const value = previous?.value ?? initialValues[variable.name] ?? variable.start ?? ''
  if (String(variable.type).toLowerCase() === 'boolean' && getVariableValueCount(variable, modelVariables) === 1) {
    return booleanValue(value)
  }
  if (NUMERIC_TYPES.has(variable.type) && getVariableValueCount(variable, modelVariables) === 1 && value !== '') {
    const number = Number(value)
    if (Number.isFinite(number)) return number
  }
  return value
}

function InputScheduleValue({ variable, modelVariables, value, onChange, disabled }) {
  const valueCount = getVariableValueCount(variable, modelVariables)
  const isBoolean = String(variable.type || '').toLowerCase() === 'boolean' && valueCount === 1
  const enumItems = valueCount === 1 ? getVariableEnumerationItems(variable) : []
  const isScalarNumeric = NUMERIC_TYPES.has(variable.type) && valueCount === 1
  const bounds = getVariableDisplayBounds(variable)
  const min = Number(bounds.min)
  const max = Number(bounds.max)
  const hasRange = isScalarNumeric && Number.isFinite(min) && Number.isFinite(max) && max > min
  const integer = INTEGER_TYPES.has(variable.type)
  const displayUnit = getVariableDisplayUnit(variable)

  if (isBoolean) {
    return (
      <select
        aria-label={`${variable.name} value`}
        value={booleanValue(value) ? 'true' : 'false'}
        onChange={(event) => onChange(event.target.value === 'true')}
        disabled={disabled}
        className="min-h-10 w-full rounded-lg border border-[#26383f] bg-[#0c171c] px-3 text-sm text-white focus:border-[#54d5c9] focus:outline-none"
      >
        <option value="false">Off / false</option>
        <option value="true">On / true</option>
      </select>
    )
  }

  if (String(variable.type || '').toLowerCase() === 'enumeration' && enumItems.length > 0) {
    return (
      <select
        aria-label={`${getVariableDisplayName(variable)} value`}
        value={String(value ?? '')}
        onChange={(event) => onChange(Number(event.target.value))}
        disabled={disabled}
        className="min-h-10 w-full rounded-lg border border-[#26383f] bg-[#0c171c] px-3 text-sm text-white focus:border-[#54d5c9] focus:outline-none"
      >
        {enumItems.map((item) => (
          <option key={item.value} value={item.value} title={item.description || undefined}>
            {item.description || item.name}
          </option>
        ))}
      </select>
    )
  }

  if (hasRange) {
    const step = integer ? 1 : Math.max(Math.min((max - min) / 100, 0.01), 0.000001)
    return (
      <div className="min-w-36">
        <div className="mb-1 flex justify-between gap-2 text-[11px] text-[#a9bec2]">
          <span>{Number(toVariableDisplayValue(variable, value)).toFixed(integer ? 0 : 2)} {displayUnit}</span>
          <span>{min}–{max}</span>
        </div>
        <input
          aria-label={`${variable.name} value`}
          type="range"
          min={min}
          max={max}
          step={step}
          value={Number(toVariableDisplayValue(variable, value))}
          onChange={(event) => onChange(fromVariableDisplayValue(variable, Number(event.target.value)))}
          disabled={disabled}
          className="w-full accent-[#54d5c9]"
        />
      </div>
    )
  }

  const inputType = isScalarNumeric ? 'number' : 'text'
  return (
    <input
      aria-label={`${variable.name} value`}
      type={inputType}
      step={isScalarNumeric ? (integer ? 1 : 'any') : undefined}
      min={isScalarNumeric ? bounds.min : undefined}
      max={isScalarNumeric ? bounds.max : undefined}
      value={formatVariableDisplayValue(variable, value)}
      onChange={(event) => onChange(fromVariableDisplayValue(variable, isScalarNumeric && event.target.value !== '' ? Number(event.target.value) : event.target.value))}
      disabled={disabled}
      placeholder={valueCount > 1 ? 'Values separated by spaces' : undefined}
      className="min-h-10 w-full rounded-lg border border-[#26383f] bg-[#0c171c] px-3 text-sm text-white focus:border-[#54d5c9] focus:outline-none"
    />
  )
}

InputScheduleValue.propTypes = {
  variable: PropTypes.object.isRequired,
  modelVariables: PropTypes.arrayOf(PropTypes.object).isRequired,
  value: PropTypes.any,
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
}

function InputScheduleRow({ event, variables, modelVariables, initialValues, events, startTime, stopTime, timeStep, disabled, onChange, onRemove }) {
  const rowId = useId()
  const variable = variables.find((item) => item.name === event.variable) || variables[0]
  if (!variable) return null

  function changeVariable(name) {
    const nextVariable = variables.find((item) => item.name === name)
    if (!nextVariable) return
    const time = Number(event.time)
    const value = findDefaultValue(nextVariable, initialValues, events, Number.isFinite(time) ? time : Number(startTime), event.id, modelVariables)
    onChange(event.id, { variable: name, value })
  }

  return (
    <div className="grid items-end gap-3 rounded-xl border border-[#26383f] bg-[#142128] p-3 sm:grid-cols-[minmax(10rem,1.15fr)_minmax(8rem,0.75fr)_minmax(10rem,1fr)_auto]">
      <div className="block text-[11px] text-[#a9bec2]">
        <span className="mb-1 flex items-center gap-1 font-medium text-[#dce9e9]">
          Input
          <VariableDescriptionTooltip name={variable.name} description={variable.description} />
        </span>
        <select
          id={`${rowId}-variable`}
          aria-label={`Input variable for scheduled change at ${event.time} seconds`}
          value={variable.name}
          onChange={(change) => changeVariable(change.target.value)}
          disabled={disabled}
          className="min-h-10 w-full rounded-lg border border-[#26383f] bg-[#0c171c] px-3 text-sm text-white focus:border-[#54d5c9] focus:outline-none"
        >
          {variables.map((input) => <option key={input.name} value={input.name}>{getVariableDisplayName(input)}</option>)}
        </select>
      </div>

      <label htmlFor={`${rowId}-time`} className="block text-[11px] text-[#a9bec2]">
        <span className="mb-1 block font-medium text-[#dce9e9]">At time (s)</span>
        <input
          id={`${rowId}-time`}
          aria-label={`Time for ${variable.name}`}
          type="number"
          min={startTime}
          max={stopTime}
          step={timeStep}
          value={event.time}
          onChange={(change) => onChange(event.id, { time: change.target.value })}
          disabled={disabled}
          className="min-h-10 w-full rounded-lg border border-[#26383f] bg-[#0c171c] px-3 text-sm text-white focus:border-[#54d5c9] focus:outline-none"
        />
      </label>

      <div>
        <span className="mb-1 block text-[11px] font-medium text-[#dce9e9]">New value</span>
        <InputScheduleValue
          variable={variable}
          modelVariables={modelVariables}
          value={event.value}
          onChange={(value) => onChange(event.id, { value })}
          disabled={disabled}
        />
      </div>

      <button
        type="button"
        onClick={() => onRemove(event.id)}
        aria-label={`Remove ${variable.name} change`}
        disabled={disabled}
        className="min-h-10 rounded-lg border border-[#583c43] px-3 text-xs font-semibold text-[#ffc8ce] transition hover:bg-[#3a232a] disabled:cursor-not-allowed disabled:opacity-40"
      >
        Remove
      </button>
    </div>
  )
}

InputScheduleRow.propTypes = {
  event: PropTypes.object.isRequired,
  variables: PropTypes.arrayOf(PropTypes.object).isRequired,
  modelVariables: PropTypes.arrayOf(PropTypes.object).isRequired,
  initialValues: PropTypes.object.isRequired,
  events: PropTypes.arrayOf(PropTypes.object).isRequired,
  startTime: PropTypes.number.isRequired,
  stopTime: PropTypes.number.isRequired,
  timeStep: PropTypes.number.isRequired,
  disabled: PropTypes.bool,
  onChange: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
}

export default function InputScheduleEditor({
  variables = [],
  modelVariables = [],
  initialValues = {},
  events = [],
  startTime = 0,
  stopTime,
  stepSize = 0.01,
  validationError = '',
  disabled = false,
  onChange = () => {},
}) {
  // Callers can omit the list or pass null; keep schedule operations on an array.
  const scheduledEvents = Array.isArray(events) ? events : []
  const canSchedule = variables.length > 0 && stopTime > startTime
  const effectiveStep = Number.isFinite(Number(stepSize)) && Number(stepSize) > 0
    ? Number(stepSize)
    : Math.max((stopTime - startTime) / 100, 0.001)
  const sortedEvents = [...scheduledEvents].sort((left, right) => Number(left.time) - Number(right.time))

  function addEvent() {
    if (!canSchedule || disabled || scheduledEvents.length >= MAX_INPUT_EVENTS) return
    const variable = variables[0]
    const duration = stopTime - startTime
    const previousTimes = scheduledEvents
      .filter((event) => event.variable === variable.name)
      .map((event) => Number(event.time))
      .filter(Number.isFinite)
    const preferredTime = previousTimes.length > 0
      ? Math.max(...previousTimes) + Math.max(duration * 0.1, effectiveStep)
      : startTime + duration * 0.1
    let stepIndex = Math.max(0, Math.ceil((preferredTime - startTime) / effectiveStep - 1e-9))
    let time = startTime + stepIndex * effectiveStep
    const occupiedTimes = new Set(previousTimes.map((previousTime) => String(previousTime)))
    while (time < stopTime && occupiedTimes.has(String(time))) {
      stepIndex += 1
      time = startTime + stepIndex * effectiveStep
    }
    if (time >= stopTime) {
      stepIndex = 0
      time = startTime
      while (time < stopTime && occupiedTimes.has(String(time))) {
        stepIndex += 1
        time = startTime + stepIndex * effectiveStep
      }
    }
    if (time >= stopTime) return

    const value = findDefaultValue(variable, initialValues, scheduledEvents, time, null, modelVariables)
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
    onChange([...scheduledEvents, { id, time, variable: variable.name, value }])
  }

  function updateEvent(id, patch) {
    onChange(scheduledEvents.map((event) => (event.id === id ? { ...event, ...patch } : event)))
  }

  function removeEvent(id) {
    onChange(scheduledEvents.filter((event) => event.id !== id))
  }

  return (
    <section className="grid gap-3 rounded-xl border border-[#26383f] bg-[#0c171c] p-3" aria-labelledby="input-schedule-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="input-schedule-title" className="text-sm font-semibold text-white">Changes during simulation</h3>
          <p className="mt-1 text-xs text-[#829ba1]">Schedule as many input changes as you need. Each value takes effect at its simulation time.</p>
        </div>
        <button
          type="button"
          onClick={addEvent}
          disabled={!canSchedule || disabled || scheduledEvents.length >= MAX_INPUT_EVENTS}
          className="min-h-10 rounded-lg border border-[#35736f] bg-[#173e40] px-3 text-xs font-semibold text-[#b8fff1] transition hover:bg-[#205856] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Add change
        </button>
      </div>

      {sortedEvents.length > 0 ? (
        <div className="grid gap-2">
          {sortedEvents.map((event) => (
            <InputScheduleRow
              key={event.id}
              event={event}
              variables={variables}
              modelVariables={modelVariables}
              initialValues={initialValues}
              events={scheduledEvents}
              startTime={startTime}
              stopTime={stopTime}
              timeStep={effectiveStep}
              disabled={disabled}
              onChange={updateEvent}
              onRemove={removeEvent}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-[#26383f] px-3 py-3 text-xs text-[#829ba1]">
          No input changes scheduled. The FMU will keep the starting values for the whole simulation.
        </p>
      )}

      {scheduledEvents.length >= MAX_INPUT_EVENTS && (
        <p className="text-xs text-[#e2c98c]">The schedule is limited to {MAX_INPUT_EVENTS} changes per run.</p>
      )}
      {validationError ? <p role="alert" className="text-xs text-[#ffb5bd]">{validationError}</p> : null}
    </section>
  )
}

InputScheduleEditor.propTypes = {
  variables: PropTypes.arrayOf(PropTypes.object).isRequired,
  modelVariables: PropTypes.arrayOf(PropTypes.object).isRequired,
  initialValues: PropTypes.object.isRequired,
  events: PropTypes.arrayOf(PropTypes.object),
  startTime: PropTypes.number,
  stopTime: PropTypes.number.isRequired,
  stepSize: PropTypes.number,
  validationError: PropTypes.string,
  disabled: PropTypes.bool,
  onChange: PropTypes.func.isRequired,
}

InputScheduleEditor.defaultProps = {
  events: [],
  startTime: 0,
  stepSize: 0.01,
  validationError: '',
  disabled: false,
}
