"use client";
import React from 'react'
import PropTypes from 'prop-types'
import { getSimulationOptionsError } from '../utils/simulationTime'
import { getLeastSignificantDigitStep } from '../utils/simulationParameters'
import VariableDescriptionTooltip from './VariableDescriptionTooltip'
import { resolveEffectiveTolerance } from '@decentralabs/digital-twin-app-protocol'

/**
 * SimulationOptions — start time, stop time, and step size.
 *
 * @param {Object} props
 * @param {Object} props.options   - { startTime, stopTime, stepSize }
 * @param {Function} props.onChange - (name, value) => void
 * @param {boolean} [props.disabled]
 * @param {boolean} [props.readOnlyStartTime]
 */
export default function SimulationOptions({
  options,
  onChange,
  simulationType,
  timeUnit = 's',
  defaultTolerance,
  requireStopTime = true,
  disabled = false,
  readOnlyStartTime = false,
}) {
  const includeStepSize = simulationType !== 'ScheduledExecution'
  const timeLabel = typeof timeUnit === 'string' && timeUnit.trim() ? timeUnit.trim() : 'model time'
  const fields = [
    {
      key: 'startTime',
      label: `Start Time (${timeLabel})`,
      description: readOnlyStartTime
        ? 'Uses the FMI DefaultExperiment, selected experiment, or loaded state. The unit comes from the FMI independent variable.'
        : 'Beginning of the simulation interval, in the FMI independent-variable unit.',
      readOnly: readOnlyStartTime,
    },
    {
      key: 'stopTime',
      label: `Stop Time (${timeLabel})`,
      description: requireStopTime
        ? 'Required end time for a batch run, in the FMI independent-variable unit.'
        : 'Optional end time in the FMI independent-variable unit. Leave blank to keep running until you stop it.',
    },
    ...(includeStepSize ? [{
      key: 'stepSize',
      label: `Step Size (${timeLabel})`,
      description: simulationType === 'CoSimulation'
        ? 'Preferred communication interval.'
        : 'Preferred simulation step, when supported by the FMU type.',
    }] : []),
  ]
  const validationError = getSimulationOptionsError(options, { includeStepSize, requireStopTime })
  const effectiveTolerance = resolveEffectiveTolerance(options, defaultTolerance)

  function handleWheel(event, key) {
    if (disabled || event.currentTarget !== document.activeElement || (readOnlyStartTime && key === 'startTime')
      || event.deltaY === 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return

    const current = Number(options[key])
    if (!Number.isFinite(current)) return

    const wheelStep = getLeastSignificantDigitStep(options[key])
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
        {fields.map(({ key, label, description, readOnly = false }) => (
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
                onChange={readOnly ? undefined : (e) => onChange(key, e.target.value)}
                onWheel={(event) => handleWheel(event, key)}
                readOnly={readOnly}
                aria-readonly={readOnly || undefined}
                className={`min-h-10 w-full rounded-lg border border-[#26383f] px-3 text-sm text-white focus:border-[#54d5c9] focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${readOnly ? 'cursor-not-allowed bg-[#101a20] text-[#b8d2d5]' : 'bg-[#142128]'}`}
              />
            </VariableDescriptionTooltip>
          </div>
        ))}
      </div>
      {validationError ? <p role="alert" className="text-xs text-[#ffb5bd]">{validationError}</p> : null}
      {simulationType === 'ScheduledExecution' ? (
        <p className="text-xs text-[#829ba1]">Scheduled Execution is driven by model clocks, so FMI does not define a generic step-size setting for it.</p>
      ) : null}
      {effectiveTolerance ? (
        <p className="text-xs text-[#829ba1]">
          The {effectiveTolerance.source === 'run-option' ? 'effective run' : 'default'} relative tolerance used for integrating differential-algebraic equations (DAEs) is{' '}
          <span className="font-mono text-[#b8d2d5]">{effectiveTolerance.value.toExponential(3)}</span>.
        </p>
      ) : null}
    </fieldset>
  )
}

SimulationOptions.propTypes = {
  options: PropTypes.shape({
    startTime: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    stopTime: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    stepSize: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    tolerance: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  }).isRequired,
  onChange: PropTypes.func.isRequired,
  simulationType: PropTypes.string,
  timeUnit: PropTypes.string,
  defaultTolerance: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  requireStopTime: PropTypes.bool,
  disabled: PropTypes.bool,
  readOnlyStartTime: PropTypes.bool,
}
