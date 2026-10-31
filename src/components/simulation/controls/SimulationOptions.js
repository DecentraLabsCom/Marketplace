"use client";
import React from 'react'
import PropTypes from 'prop-types'
import { getSimulationOptionsError } from '../utils/simulationTime'
import VariableDescriptionTooltip from './VariableDescriptionTooltip'

/**
 * SimulationOptions — editable start time, stop time, step size.
 *
 * @param {Object} props
 * @param {Object} props.options   - { startTime, stopTime, stepSize }
 * @param {Function} props.onChange - (name, value) => void
 * @param {boolean} [props.disabled]
 */
export default function SimulationOptions({ options, onChange, simulationType, disabled = false }) {
  const includeStepSize = simulationType !== 'ScheduledExecution'
  const fields = [
    { key: 'startTime', label: 'Start Time (s)', description: 'Beginning of the simulation interval.' },
    { key: 'stopTime', label: 'Stop Time (s)', description: 'End of the simulation interval.' },
    ...(includeStepSize ? [{
      key: 'stepSize',
      label: 'Step Size (s)',
      description: simulationType === 'CoSimulation'
        ? 'Preferred communication interval.'
        : simulationType === 'ModelExchange'
          ? 'A preferred step for the solver; the solver may use its own strategy.'
          : 'Preferred simulation step, when supported by the FMU type.',
    }] : []),
  ]
  const validationError = getSimulationOptionsError(options, { includeStepSize })

  function handleWheel(event, key) {
    if (disabled || event.deltaY === 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return

    const current = Number(options[key])
    if (!Number.isFinite(current)) return

    const configuredStepSize = Number(options.stepSize)
    const wheelStep = key === 'stepSize'
      ? Math.max(Math.abs(current) * 0.1, 0.000001)
      : Number.isFinite(configuredStepSize) && configuredStepSize > 0
        ? configuredStepSize
        : 1
    const direction = event.deltaY < 0 ? 1 : -1
    const next = Number((current + direction * wheelStep).toPrecision(12))
    const nextValue = key === 'stepSize' ? Math.max(next, 0.000000000001) : next
    if (!Number.isFinite(nextValue) || nextValue === current) return

    event.preventDefault()
    onChange(key, String(nextValue))
  }

  return (
    <fieldset className="grid gap-3 rounded-xl border border-[#26383f] bg-[#0c171c] p-3" disabled={disabled}>
      <legend className="text-sm font-semibold text-white">Simulation time</legend>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {fields.map(({ key, label, description }) => (
          <div key={key} className="grid content-start gap-1">
            <VariableDescriptionTooltip name={label} description={description}>
              <label htmlFor={`sim-opt-${key}`} className="cursor-help text-xs font-medium text-[#dce9e9]">
                {label}
              </label>
            </VariableDescriptionTooltip>
            <VariableDescriptionTooltip name={label} description={description}>
              <input
                id={`sim-opt-${key}`}
                type="number"
                step="any"
                value={options[key] ?? ''}
                onChange={(e) => onChange(key, e.target.value)}
                onWheel={(event) => handleWheel(event, key)}
                className="min-h-10 w-full rounded-lg border border-[#26383f] bg-[#142128] px-3 text-sm text-white focus:border-[#54d5c9] focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
              />
            </VariableDescriptionTooltip>
          </div>
        ))}
      </div>
      {validationError ? <p role="alert" className="text-xs text-[#ffb5bd]">{validationError}</p> : null}
      {simulationType === 'ScheduledExecution' ? (
        <p className="text-xs text-[#829ba1]">Scheduled Execution is driven by model clocks, so FMI does not define a generic step-size setting for it.</p>
      ) : null}
    </fieldset>
  )
}

SimulationOptions.propTypes = {
  options: PropTypes.shape({
    startTime: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    stopTime: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    stepSize: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  }).isRequired,
  onChange: PropTypes.func.isRequired,
  simulationType: PropTypes.string,
  disabled: PropTypes.bool,
}
