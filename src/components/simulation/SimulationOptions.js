"use client";
import React from 'react'
import PropTypes from 'prop-types'

/**
 * SimulationOptions — editable start time, stop time, step size.
 *
 * @param {Object} props
 * @param {Object} props.options   - { startTime, stopTime, stepSize }
 * @param {Function} props.onChange - (name, value) => void
 * @param {boolean} [props.disabled]
 */
export default function SimulationOptions({ options, onChange, disabled = false }) {
  const fields = [
    { key: 'startTime', label: 'Start Time (s)' },
    { key: 'stopTime',  label: 'Stop Time (s)' },
    { key: 'stepSize',  label: 'Step Size (s)' },
  ]

  return (
    <div>
      <h3 className="text-sm font-semibold text-header-bg mb-2">Simulation Options</h3>
      <div className="flex flex-wrap gap-4">
        {fields.map(({ key, label }) => (
          <div key={key} className="flex flex-col gap-1">
            <label htmlFor={`sim-opt-${key}`} className="text-xs text-text-secondary">
              {label}
            </label>
            <input
              id={`sim-opt-${key}`}
              type="number"
              step="any"
              value={options[key] ?? ''}
              onChange={(e) => onChange(key, e.target.value)}
              disabled={disabled}
              className="w-32 bg-[#1f2426] border border-[#2a2f33] rounded px-2 py-1 text-neutral-200 text-sm
                focus:outline-none focus:border-brand disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
        ))}
      </div>
    </div>
  )
}

SimulationOptions.propTypes = {
  options: PropTypes.shape({
    startTime: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    stopTime: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    stepSize: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  }).isRequired,
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
}
