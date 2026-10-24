'use client'

import { useId, useState } from 'react'
import PropTypes from 'prop-types'
import Modal from '@/components/ui/Modal'
import {
  formatVariableDisplayValue,
  fromVariableDisplayValue,
  getVariableDescription,
  getVariableDisplayBounds,
  getVariableDisplayName,
  getVariableDisplayUnit,
  getVariableEnumerationItems,
  getVariableValueCount,
  normalizeInputSchedule,
  toVariableDisplayValue,
} from './simulationParameters'
import VariableDescriptionTooltip from './VariableDescriptionTooltip'
import InputScheduleEditor from './InputScheduleEditor'
import SimulationOptions from './SimulationOptions'
import { getSimulationOptionsError } from './simulationTime'

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

function DigitalTwinInput({ variable, modelVariables, value, onChange, disabled }) {
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
  const hasRange = NUMERIC_TYPES.has(variable.type)
    && valueCount === 1
    && Number.isFinite(min)
    && Number.isFinite(max)
    && max > min

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
          value={Number(toVariableDisplayValue(variable, value))}
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

export default function DigitalTwinSimulationForm({
  variables,
  modelVariables,
  values,
  onInputChange,
  simulationOptions,
  onSimulationOptionChange,
  simulationType,
  enableInputSchedule = true,
  inputEvents = [],
  onInputEventsChange = () => {},
  running = false,
  onRun,
  children,
}) {
  const [activeDialog, setActiveDialog] = useState(null)
  const includeStepSize = simulationType !== 'ScheduledExecution'
  const simulationOptionsError = getSimulationOptionsError(simulationOptions, { includeStepSize })
  let inputScheduleError = ''
  if (enableInputSchedule && !simulationOptionsError) {
    try {
      normalizeInputSchedule(
        inputEvents,
        variables,
        modelVariables,
        Number(simulationOptions.startTime),
        Number(simulationOptions.stopTime),
        Number(simulationOptions.stepSize),
      )
    } catch (error) {
      inputScheduleError = error.message
    }
  }

  function handleRun() {
    if (simulationOptionsError) {
      setActiveDialog('run-controls')
      return
    }
    if (inputScheduleError) {
      setActiveDialog('schedule')
      return
    }
    setActiveDialog(null)
    onRun(inputEvents)
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#263a42] bg-[#101a20] p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => setActiveDialog('run-controls')}
            disabled={running}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#30464d] bg-[#142128] px-3 text-xs font-semibold text-[#dce9e9] transition hover:border-[#54d5c9] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#54d5c9] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span>Run Controls</span>
            <span className="rounded-full bg-[#20363d] px-2 py-0.5 font-mono text-[10px] text-[#9ab8bd]">{variables.length}</span>
          </button>
          {enableInputSchedule && variables.length > 0 ? (
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setActiveDialog('schedule')}
              disabled={running}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#30464d] bg-[#142128] px-3 text-xs font-semibold text-[#dce9e9] transition hover:border-[#54d5c9] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#54d5c9] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span>Schedule input changes</span>
              <span className="rounded-full bg-[#20363d] px-2 py-0.5 font-mono text-[10px] text-[#9ab8bd]">{inputEvents.length}</span>
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {children}
          <button
            type="button"
            onClick={handleRun}
            disabled={running}
            className="min-h-10 rounded-xl bg-[#20b7aa] px-5 py-2.5 text-sm font-bold text-[#061416] transition hover:bg-[#49d7c8] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? 'Running…' : 'Run simulation'}
          </button>
        </div>
        {!activeDialog && (simulationOptionsError || inputScheduleError) ? (
          <p role="alert" className="w-full text-xs text-[#ffb5bd]">
            {simulationOptionsError || inputScheduleError}
          </p>
        ) : null}
      </div>

      <Modal
        isOpen={activeDialog === 'run-controls'}
        onClose={() => setActiveDialog(null)}
        title="Run Controls"
        size="2xl"
        theme="dark"
        className="bg-[#101a20]! border border-[#263a42]"
        portal
      >
        <p className="mb-4 text-xs text-[#829ba1]">Set model inputs and simulation time for the next run.</p>
        <section className="mb-4 grid gap-3" aria-labelledby="digital-twin-run-inputs-title">
          <h3 id="digital-twin-run-inputs-title" className="text-sm font-semibold text-white">Model inputs</h3>
          {variables.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {variables.map((variable) => (
                <DigitalTwinInput
                  key={variable.name}
                  variable={variable}
                  modelVariables={modelVariables}
                  value={values[variable.name]}
                  onChange={onInputChange}
                  disabled={running}
                />
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-[#26383f] bg-[#0c171c] px-3 py-2 text-xs text-[#829ba1]">This FMU has no input variables.</p>
          )}
        </section>
        <SimulationOptions
          options={simulationOptions}
          onChange={onSimulationOptionChange}
          simulationType={simulationType}
          disabled={running}
        />
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => setActiveDialog(null)}
            className="min-h-10 rounded-lg border border-[#30464d] px-4 text-xs font-semibold text-[#dce9e9] transition hover:border-[#54d5c9] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#54d5c9]"
          >
            Done
          </button>
        </div>
      </Modal>

      {enableInputSchedule && variables.length > 0 ? (
        <Modal
          isOpen={activeDialog === 'schedule'}
          onClose={() => setActiveDialog(null)}
          title="Schedule input changes"
          size="2xl"
          theme="dark"
          className="bg-[#101a20]! border border-[#263a42]"
          portal
        >
          <InputScheduleEditor
            variables={variables}
            modelVariables={modelVariables}
            initialValues={values}
            events={inputEvents}
            startTime={Number(simulationOptions.startTime)}
            stopTime={Number(simulationOptions.stopTime)}
            stepSize={Number(simulationOptions.stepSize)}
            validationError={inputScheduleError}
            disabled={running}
            tooltipPortal
            onChange={onInputEventsChange}
          />
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => setActiveDialog(null)}
              className="min-h-10 rounded-lg border border-[#30464d] px-4 text-xs font-semibold text-[#dce9e9] transition hover:border-[#54d5c9] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#54d5c9]"
            >
              Done
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  )
}

DigitalTwinSimulationForm.propTypes = {
  variables: PropTypes.arrayOf(PropTypes.object).isRequired,
  modelVariables: PropTypes.arrayOf(PropTypes.object).isRequired,
  values: PropTypes.object.isRequired,
  onInputChange: PropTypes.func.isRequired,
  simulationOptions: PropTypes.shape({
    startTime: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    stopTime: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    stepSize: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  }).isRequired,
  onSimulationOptionChange: PropTypes.func.isRequired,
  simulationType: PropTypes.string,
  enableInputSchedule: PropTypes.bool,
  inputEvents: PropTypes.arrayOf(PropTypes.object),
  onInputEventsChange: PropTypes.func,
  running: PropTypes.bool,
  onRun: PropTypes.func.isRequired,
  children: PropTypes.node,
}
