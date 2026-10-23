"use client";
import React from 'react'
import PropTypes from 'prop-types'
import { getSimulationOptionsError } from './simulationTime'

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
        ? 'FMI default, when declared, is the preferred communication interval.'
        : simulationType === 'ModelExchange'
          ? 'A preferred step for the solver; the solver may use its own strategy.'
          : 'Preferred simulation step, when supported by the FMU type.',
    }] : []),
  ]
  const validationError = getSimulationOptionsError(options, { includeStepSize })

  return (
    <fieldset className="grid gap-3 rounded-xl border border-[#26383f] bg-[#0c171c] p-3" disabled={disabled}>
      <legend className="text-sm font-semibold text-white">Simulation time</legend>
      <p className="text-xs text-[#829ba1]">
        {includeStepSize
          ? 'Uses FMI defaults when declared. Missing values use tool defaults: start 0, stop 10, and step 0.01.'
          : 'Uses FMI defaults when declared. Missing start and stop values use tool defaults: start 0 and stop 10.'}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {fields.map(({ key, label, description }) => (
          <div key={key} className="grid content-start gap-1">
            <label htmlFor={`sim-opt-${key}`} className="text-xs font-medium text-[#dce9e9]">
              {label}
            </label>
            <input
              id={`sim-opt-${key}`}
              type="number"
              step="any"
              value={options[key] ?? ''}
              onChange={(e) => onChange(key, e.target.value)}
              aria-describedby={`sim-opt-description-${key}`}
              className="min-h-10 w-full rounded-lg border border-[#26383f] bg-[#142128] px-3 text-sm text-white focus:border-[#54d5c9] focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
            />
            <span id={`sim-opt-description-${key}`} className="text-[11px] text-[#829ba1]">{description}</span>
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
